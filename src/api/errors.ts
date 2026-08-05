export const ERROR_DEFINITIONS = {
  VALIDATION_ERROR: { status: 400, message: "The request contains invalid data." },
  SESSION_REQUIRED: { status: 401, message: "A valid session is required." },
  INVALID_REVIEW_CODE: { status: 401, message: "The review code is invalid." },
  FORBIDDEN_ORIGIN: { status: 403, message: "The request origin is not allowed." },
  RESOURCE_NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  VERSION_CONFLICT: { status: 409, message: "The resource version has changed." },
  IDEMPOTENCY_KEY_REUSED: { status: 409, message: "The idempotency key was already used." },
  ASSESSMENT_LOCKED: { status: 409, message: "The assessment can no longer be changed." },
  ASSESSMENT_NOT_COMPLETED: { status: 409, message: "The assessment is not complete." },
  ASSESSMENT_INCOMPLETE: { status: 422, message: "The assessment contains incomplete data." },
  STEP_PREREQUISITE_MISSING: { status: 422, message: "Required earlier answers are missing." },
  BUSINESS_RULE_VIOLATION: { status: 422, message: "The request violates a business rule." },
  RATE_LIMITED: { status: 429, message: "Too many requests." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request body is too large." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "Content-Type must be application/json." },
  INTERNAL_ERROR: { status: 500, message: "An internal error occurred." },
  DEMO_EXCHANGE_UNAVAILABLE: { status: 503, message: "The demo exchange is unavailable." },
  SERVICE_UNAVAILABLE: { status: 503, message: "The service is unavailable." },
} as const;

export type ApiErrorCode = keyof typeof ERROR_DEFINITIONS;
export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: readonly ApiErrorDetail[];
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    code: ApiErrorCode,
    options: { details?: readonly ApiErrorDetail[]; headers?: Readonly<Record<string, string>> } = {},
  ) {
    const definition = ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = "ApiError";
    this.code = code;
    this.status = definition.status;
    this.details = options.details ?? [];
    this.headers = options.headers ?? {};
  }
}
