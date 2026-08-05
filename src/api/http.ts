import { randomUUID } from "node:crypto";
import { ApiError, ERROR_DEFINITIONS, type ApiErrorCode, type ApiErrorDetail } from "./errors.js";

export interface RequestContext {
  requestId: string;
}

export interface SafeLogEntry {
  requestId: string;
  method: string;
  path: string;
  status: number;
  errorCode?: ApiErrorCode;
}

export type SafeLogger = (entry: SafeLogEntry) => void;

type ResponseHeaders = Headers | Readonly<Record<string, string>>;

export interface ApiSuccess<T = unknown> {
  data: T;
  status?: number;
  headers?: ResponseHeaders;
}

export type ApiHandler = (request: Request, context: RequestContext) => Promise<ApiSuccess>;

export function apiSuccess<T>(data: T, options: { status?: number; headers?: ResponseHeaders } = {}): ApiSuccess<T> {
  return {
    data,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  };
}

function jsonResponse(body: unknown, status: number, requestId: string, headers?: ResponseHeaders): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function successResponse<T>(data: T, context: RequestContext, status = 200, headers?: ResponseHeaders): Response {
  return jsonResponse({ data, meta: { requestId: context.requestId } }, status, context.requestId, headers);
}

export function errorResponse(error: unknown, context: RequestContext): Response {
  const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR");
  return jsonResponse(
    {
      error: {
        code: apiError.code,
        message: ERROR_DEFINITIONS[apiError.code].message,
        details: apiError.details.map(({ field, reason }): ApiErrorDetail => ({ field, reason })),
        requestId: context.requestId,
      },
    },
    apiError.status,
    context.requestId,
    apiError.headers,
  );
}

export async function handleApiRequest(
  request: Request,
  handler: ApiHandler,
  options: { createRequestId?: () => string; logger?: SafeLogger } = {},
): Promise<Response> {
  const context = { requestId: `req_${(options.createRequestId ?? randomUUID)()}` };
  let response: Response;
  let errorCode: ApiErrorCode | undefined;
  try {
    const result = await handler(request, context);
    response = successResponse(result.data, context, result.status ?? 200, result.headers);
  } catch (error) {
    errorCode = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
    response = errorResponse(error, context);
  }

  options.logger?.({
    requestId: context.requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    status: response.status,
    ...(errorCode ? { errorCode } : {}),
  });
  return response;
}
