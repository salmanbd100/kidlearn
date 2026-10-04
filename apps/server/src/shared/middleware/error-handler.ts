import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../../config/logger.js";
import { ApiError, type ErrorEnvelope } from "../errors/errors.js";

/** Terminal middleware for requests that matched no route. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ErrorEnvelope = {
    error: { code: "NOT_FOUND", message: "Route not found" },
  };
  res.status(404).json(body);
};

/**
 * The single place errors become responses. Must be registered last, after
 * every route and after `notFoundHandler`.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Once a response has started there is no envelope left to send; Express's own
  // handler knows how to abort the socket, ours would throw ERR_HTTP_HEADERS_SENT.
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

  // Anything reaching here is unexpected: log the real error server-side and
  // return a fixed message so internals never leak to the client.
  // `req.log` is attached by pino-http; fall back for apps that skip it.
  (req.log ?? logger).error({ err }, "Unhandled error");

  const body: ErrorEnvelope = {
    error: { code: "INTERNAL", message: "Something went wrong" },
  };
  res.status(500).json(body);
};

/**
 * `express.json()` rejects a malformed or oversized body with a plain error that
 * carries `type` and `status` rather than an `ApiError`. That is the client's
 * mistake, not a server fault, so it must not fall through to the 500 branch.
 */
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
