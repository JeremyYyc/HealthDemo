import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";

export const SESSION_COOKIE_NAME = "health_demo_session";

export interface AuthorizedSession {
  id: string;
  expiresAt: Date;
}

export interface SessionLookup {
  findByTokenHash(tokenHash: string): Promise<AuthorizedSession | null>;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export function digestOpaqueValue(value: string, secret: string): string {
  if (!secret) throw new Error("A digest secret is required");
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function constantTimeDigestEquals(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function requireSession(
  request: Request,
  dependencies: {
    sessions: SessionLookup;
    tokenSecret: string;
    cookieName?: string;
    secureCookie?: boolean;
    now?: Date;
  },
): Promise<AuthorizedSession> {
  const token = readCookie(request.headers.get("cookie"), dependencies.cookieName ?? SESSION_COOKIE_NAME);
  if (!token) throw new ApiError("SESSION_REQUIRED");
  const session = await dependencies.sessions.findByTokenHash(digestOpaqueValue(token, dependencies.tokenSecret));
  const now = dependencies.now ?? new Date();
  if (!session || session.expiresAt.getTime() <= now.getTime()) {
    const cookieName = dependencies.cookieName ?? SESSION_COOKIE_NAME;
    const secure = dependencies.secureCookie ? "; Secure" : "";
    throw new ApiError("SESSION_REQUIRED", {
      headers: {
        "set-cookie": `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
      },
    });
  }
  return session;
}

export interface OwnedResourceLookup<T> {
  findOwned(input: { resourceId: string; sessionId: string }): Promise<T | null>;
}

export async function requireOwnedResource<T>(
  resources: OwnedResourceLookup<T>,
  input: { resourceId: string; sessionId: string },
): Promise<T> {
  const resource = await resources.findOwned(input);
  if (!resource) throw new ApiError("RESOURCE_NOT_FOUND");
  return resource;
}
