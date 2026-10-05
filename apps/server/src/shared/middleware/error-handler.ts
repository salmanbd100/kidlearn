import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../../config/logger.js";
import { ApiError, type ErrorEnvelope } from "../errors/errors.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ErrorEnvelope = {
    error: { code: "NOT_FOUND", message: "Route not found" },
  };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Once a response has started there is no envelope left; ours would throw ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) {
    next(err);
    return;
  }

  const bodyError = toBodyParserEnvelope(err);
  if (bodyError) {
    res.status(bodyError.status).json(bodyError.body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorEnvelope = {
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid request",
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof ApiError) {
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected: log the real error and return a fixed message so internals never leak. `req.log` comes from pino-http.
  (req.log ?? logger).error({ err }, "Unhandled error");

  const body: ErrorEnvelope = {
    error: { code: "INTERNAL", message: "Something went wrong" },
  };
  res.status(500).json(body);
};

/** `express.json()` rejects bad bodies with a plain error carrying `type` and `status`; that is a client error, not a 500. */
function toBodyParserEnvelope(
  err: unknown,
): { status: 400 | 413; body: ErrorEnvelope } | undefined {
  if (typeof err !== "object" || err === null || !("type" in err)) {
    return undefined;
  }

  if (err.type === "entity.parse.failed") {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request body is not valid JSON",
        },
      },
    };
  }

  if (err.type === "entity.too.large") {
    return {
      status: 413,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request body is too large",
        },
      },
    };
  }

  return undefined;
}
