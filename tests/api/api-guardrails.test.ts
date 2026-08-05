import { describe, expect, it, vi } from "vitest";
import { digestOpaqueValue, requireOwnedResource, requireSession } from "../../src/api/auth.js";
import { ApiError, ERROR_DEFINITIONS, type ApiErrorCode } from "../../src/api/errors.js";
import { createHealthRoute } from "../../src/api/health.js";
import { apiSuccess, errorResponse, handleApiRequest, type SafeLogEntry } from "../../src/api/http.js";
import {
  createJsonWriteRoute,
  MAX_JSON_BODY_BYTES,
} from "../../src/api/write-guard.js";

const appBaseUrl = "https://health.example:8443";

function writeRequest(options: {
  body?: string | null;
  contentType?: string | null;
  origin?: string | null;
} = {}): Request {
  const headers = new Headers();
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json");
  if (options.origin !== null) headers.set("origin", options.origin ?? appBaseUrl);
  return new Request(`${appBaseUrl}/api/test`, {
    method: "POST",
    headers,
    body: options.body === undefined ? JSON.stringify({ ok: true }) : options.body,
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("P0-10 shared API guardrails", () => {
  const route = createJsonWriteRoute(
    async (_request, context) => apiSuccess({ received: context.body }),
    { appBaseUrl, createRequestId: () => "fixed" },
  );

  it("P0-10-T01 rejects media type, empty/malformed/oversize JSON, and missing or foreign Origin", async () => {
    const cases = [
      [writeRequest({ contentType: "text/plain" }), 415, "UNSUPPORTED_MEDIA_TYPE"],
      [writeRequest({ body: "" }), 400, "VALIDATION_ERROR"],
      [writeRequest({ body: "{" }), 400, "VALIDATION_ERROR"],
      [writeRequest({ body: JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) }) }), 413, "PAYLOAD_TOO_LARGE"],
      [writeRequest({ origin: null }), 403, "FORBIDDEN_ORIGIN"],
      [writeRequest({ origin: "https://health.example:8443.evil.test" }), 403, "FORBIDDEN_ORIGIN"],
      [writeRequest({ origin: "ftp://health.example:8443" }), 403, "FORBIDDEN_ORIGIN"],
    ] as const;

    for (const [request, status, code] of cases) {
      const response = await route(request);
      expect(response.status).toBe(status);
      expect(await responseJson(response)).toMatchObject({
        error: { code, details: [], requestId: "req_fixed" },
      });
    }

    const accepted = await route(writeRequest({ contentType: "application/json; charset=utf-8" }));
    expect(accepted.status).toBe(200);

    const invalidUtf8 = await route(
      new Request(`${appBaseUrl}/api/test`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: appBaseUrl },
        body: new Uint8Array([0xff]),
      }),
    );
    expect(invalidUtf8.status).toBe(400);
  });

  it("P0-10-T02 gives invalid and expired cookies the same 401 and hides cross-session resources as 404", async () => {
    const secret = "test-only-token-secret";
    const validHash = digestOpaqueValue("valid-token", secret);
    const sessions = {
      findByTokenHash: vi.fn(async (tokenHash: string) => {
        if (tokenHash === validHash) return { id: "session-a", expiresAt: new Date("2026-08-06T00:00:00Z") };
        if (tokenHash === digestOpaqueValue("expired-token", secret)) {
          return { id: "session-expired", expiresAt: new Date("2026-08-04T00:00:00Z") };
        }
        return null;
      }),
    };
    const authorize = (token: string) =>
      requireSession(
        new Request("https://health.example/api/session", {
          headers: { cookie: `health_demo_session=${token}` },
        }),
        { sessions, tokenSecret: secret, now: new Date("2026-08-05T00:00:00Z") },
      );

    await expect(authorize("invalid-token")).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
      status: 401,
      headers: { "set-cookie": expect.stringContaining("Max-Age=0") },
    });
    await expect(authorize("expired-token")).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
      status: 401,
      headers: { "set-cookie": expect.stringContaining("Max-Age=0") },
    });
    await expect(authorize("valid-token")).resolves.toMatchObject({ id: "session-a" });

    const resources = [
      { id: "owned", sessionId: "session-a" },
      { id: "foreign", sessionId: "session-b" },
    ];
    const ownedLookup = {
      findOwned: vi.fn(async ({ resourceId, sessionId }: { resourceId: string; sessionId: string }) =>
        resources.find((resource) => resource.id === resourceId && resource.sessionId === sessionId) ?? null,
      ),
    };
    const missing = await handleApiRequest(
      new Request("https://health.example/api/assessments/missing"),
      async () => apiSuccess(await requireOwnedResource(ownedLookup, { resourceId: "missing", sessionId: "session-a" })),
      { createRequestId: () => "missing" },
    );
    const foreign = await handleApiRequest(
      new Request("https://health.example/api/assessments/foreign"),
      async () => apiSuccess(await requireOwnedResource(ownedLookup, { resourceId: "foreign", sessionId: "session-a" })),
      { createRequestId: () => "foreign" },
    );
    const owned = await handleApiRequest(
      new Request("https://health.example/api/assessments/owned"),
      async () => apiSuccess(await requireOwnedResource(ownedLookup, { resourceId: "owned", sessionId: "session-a" })),
      { createRequestId: () => "owned" },
    );
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect((await responseJson(missing)).error).toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect((await responseJson(foreign)).error).toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(owned.status).toBe(200);
    expect(ownedLookup.findOwned).toHaveBeenCalledWith({ resourceId: "foreign", sessionId: "session-a" });
  });

  it("P0-10-T03 keeps every frozen error definition and response envelope stable without internal data", async () => {
    const expected: Record<ApiErrorCode, number> = {
      VALIDATION_ERROR: 400,
      SESSION_REQUIRED: 401,
      INVALID_REVIEW_CODE: 401,
      FORBIDDEN_ORIGIN: 403,
      RESOURCE_NOT_FOUND: 404,
      VERSION_CONFLICT: 409,
      IDEMPOTENCY_KEY_REUSED: 409,
      ASSESSMENT_LOCKED: 409,
      ASSESSMENT_NOT_COMPLETED: 409,
      ASSESSMENT_INCOMPLETE: 422,
      STEP_PREREQUISITE_MISSING: 422,
      BUSINESS_RULE_VIOLATION: 422,
      RATE_LIMITED: 429,
      PAYLOAD_TOO_LARGE: 413,
      UNSUPPORTED_MEDIA_TYPE: 415,
      INTERNAL_ERROR: 500,
      DEMO_EXCHANGE_UNAVAILABLE: 503,
      SERVICE_UNAVAILABLE: 503,
    };
    expect(Object.fromEntries(Object.entries(ERROR_DEFINITIONS).map(([code, value]) => [code, value.status]))).toEqual(
      expected,
    );

    const logs: SafeLogEntry[] = [];
    const response = await handleApiRequest(
      new Request("https://health.example/api/test"),
      async () => {
        throw new Error("postgresql://user:secret@db/internal SQL token=secret stack");
      },
      { createRequestId: () => "internal", logger: (entry) => logs.push(entry) },
    );
    const serialized = JSON.stringify(await responseJson(response));
    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("req_internal");
    expect(serialized).toContain('"requestId":"req_internal"');
    expect(serialized).not.toMatch(/postgres|SQL|token|secret|stack/i);
    expect(logs).toEqual([
      { requestId: "req_internal", method: "GET", path: "/api/test", status: 500, errorCode: "INTERNAL_ERROR" },
    ]);

    const normalizedSuccess = await handleApiRequest(
      new Request("https://health.example/api/normalized"),
      async () => apiSuccess({ ok: true }),
      { createRequestId: () => "normalized" },
    );
    expect(normalizedSuccess.headers.get("x-request-id")).toBe("req_normalized");
    expect(await responseJson(normalizedSuccess)).toEqual({
      data: { ok: true },
      meta: { requestId: "req_normalized" },
    });

    for (const code of Object.keys(expected) as ApiErrorCode[]) {
      const frozen = errorResponse(new ApiError(code), { requestId: "req_contract" });
      expect(await responseJson(frozen)).toEqual({
        error: {
          code,
          message: ERROR_DEFINITIONS[code].message,
          details: [],
          requestId: "req_contract",
        },
      });
    }
  });

  it("P0-10-T05 returns safe 200/503 health envelopes and performs only the injected read probe", async () => {
    const check = vi.fn(async () => undefined);
    const healthy = createHealthRoute({ database: { check }, appVersion: "1.2.3", createRequestId: () => "health" });
    const healthyResponse = await healthy(new Request("https://health.example/api/health"));
    expect(healthyResponse.status).toBe(200);
    expect(await responseJson(healthyResponse)).toEqual({
      data: { status: "ok", database: "reachable", appVersion: "1.2.3" },
      meta: { requestId: "req_health" },
    });
    expect(check).toHaveBeenCalledOnce();

    const unavailable = createHealthRoute({
      database: { check: async () => Promise.reject(new Error("DATABASE_URL=secret table_count=5")) },
      appVersion: "1.2.3",
      createRequestId: () => "failed-health",
    });
    const unavailableResponse = await unavailable(new Request("https://health.example/api/health"));
    const serialized = JSON.stringify(await responseJson(unavailableResponse));
    expect(unavailableResponse.status).toBe(503);
    expect(serialized).toContain("SERVICE_UNAVAILABLE");
    expect(serialized).not.toMatch(/DATABASE_URL|secret|table_count/i);
  });
});
