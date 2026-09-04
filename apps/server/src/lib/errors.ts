/**
 * ---------------------------------------------------------------------------
 * JSON response envelope — every kidlearn API response uses one of two shapes.
 * No route ever sends a bare body.
 */

import { ERROR_CODES, type ErrorCode } from "@kidlearn/types";

// --- Error vocabulary -----------------------------------------------------
// `ERROR_CODES` moved to `@kidlearn/types` in file 12a, because the parent UI
// branches on it: `CONSENT_REQUIRED`, `PIN_REQUIRED` and
// `PIN_VERIFICATION_REQUIRED` are three different destinations behind the same
// 403, and a client that tells them apart by matching message strings breaks the
// first time someone rewords a message. Distinct top-level codes rather than a
// `details.reason` discriminator, for the same reason.
//
// Re-exported so `ApiError` and every existing import keep working: within
// `apps/server`, `lib/errors.js` remains the place to import an error code from.
export { ERROR_CODES, type ErrorCode };

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
