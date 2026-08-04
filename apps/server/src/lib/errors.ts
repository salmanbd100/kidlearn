/**
 * ---------------------------------------------------------------------------
 * JSON response envelope — every kidlearn API response uses one of two shapes.
 * No route ever sends a bare body.
 *
 * Success (2xx):
 *   { "data": <payload> }
 *
 * Failure (4xx / 5xx):
 *   { "error": { "code": <ErrorCode>, "message": string, "details"?: unknown } }
 *
 * `code` is machine-readable and stable — clients branch on it. `message` is a
 * human-readable hint for developers and is never shown verbatim to a child.
 * `details` carries structured context (e.g. flattened Zod issues) and is
 * omitted when there is none. Unexpected server errors are always reported as
 * `INTERNAL` with a fixed message; the underlying error is logged, never sent.
 * ---------------------------------------------------------------------------
 */

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type SuccessEnvelope<TData> = { data: TData };

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string; details?: unknown };
};

/**
 * The only error type route handlers and services should throw deliberately.
 * The central error handler converts it into an `ErrorEnvelope`.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Not allowed"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, "CONFLICT", message, details);
  }
}
