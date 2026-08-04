import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError, type ErrorEnvelope } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

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
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
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
