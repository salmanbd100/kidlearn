import { ERROR_CODES, type ErrorCode } from "@kidlearn/types";

// Codes live in `@kidlearn/types` because the parent UI branches on them (`CONSENT_REQUIRED` vs `FORBIDDEN` share a 403);
// re-exported so server code keeps importing from here.
export { ERROR_CODES, type ErrorCode };

export type SuccessEnvelope<TData> = { data: TData };

export type ErrorEnvelope = {
  error: { code: ErrorCode; message: string; details?: unknown };
};

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
