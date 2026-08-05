import { ApiError } from "./errors.js";
import { handleApiRequest, type ApiSuccess, type RequestContext, type SafeLogger } from "./http.js";

export const MAX_JSON_BODY_BYTES = 16 * 1024;

export interface JsonWriteContext extends RequestContext {
  body: unknown;
}

export type JsonWriteHandler<RouteContext = unknown> = (
  request: Request,
  context: JsonWriteContext,
  routeContext: RouteContext | undefined,
) => Promise<ApiSuccess>;

function parseOrigin(value: string, field: "request" | "configured"): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin === "null" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("not an origin");
    }
    return url.origin;
  } catch {
    if (field === "request") throw new ApiError("FORBIDDEN_ORIGIN");
    throw new Error("APP_BASE_URL must be an absolute HTTP(S) origin");
  }
}

export function requireAllowedOrigin(request: Request, appBaseUrl: string): void {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin || parseOrigin(requestOrigin, "request") !== parseOrigin(appBaseUrl, "configured")) {
    throw new ApiError("FORBIDDEN_ORIGIN");
  }
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
  }
}

async function readLimitedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new ApiError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseProtectedJson(
  request: Request,
  options: { appBaseUrl: string; maximumBytes?: number },
): Promise<unknown> {
  requireJsonContentType(request);
  requireAllowedOrigin(request, options.appBaseUrl);
  const bytes = await readLimitedBody(request, options.maximumBytes ?? MAX_JSON_BODY_BYTES);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError("VALIDATION_ERROR");
  }
  if (!text.trim()) throw new ApiError("VALIDATION_ERROR");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("VALIDATION_ERROR");
  }
}

export function createJsonWriteRoute<RouteContext = unknown>(
  handler: JsonWriteHandler<RouteContext>,
  options: {
    appBaseUrl: string;
    maximumBytes?: number;
    createRequestId?: () => string;
    logger?: SafeLogger;
  },
): (request: Request, routeContext?: RouteContext) => Promise<Response> {
  return (request, routeContext) =>
    handleApiRequest(
      request,
      async (guardedRequest, context) => {
        const body = await parseProtectedJson(guardedRequest, options);
        return handler(guardedRequest, { ...context, body }, routeContext);
      },
      {
        ...(options.createRequestId ? { createRequestId: options.createRequestId } : {}),
        ...(options.logger ? { logger: options.logger } : {}),
      },
    );
}
