import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../../config/logger.js";

/** The fields of pino's serialised request this module rewrites. */
type SerializedRequest = { url?: string; query?: unknown };

/**
 * better-auth carries credentials in the query string — the Google callback's
 * `code` and `state`, and the token on its verification and reset links — so a
 * request under `/api/auth` is logged by path alone. The app's own routes keep
 * their query strings: they hold list filters, which an operator needs.
 */
export function redactAuthQuery<T extends SerializedRequest>(req: T): T {
  if (!req.url?.startsWith("/api/auth")) return req;

  const queryAt = req.url.indexOf("?");
  return {
    ...req,
    url: queryAt === -1 ? req.url : `${req.url.slice(0, queryAt)}?[redacted]`,
    query: undefined,
  };
}

/**
 * Structured request logging. Every request gets a correlation id — reused
 * from an inbound `x-request-id` when a proxy already assigned one — which is
 * echoed back on the response and attached to `req.log` for downstream use.
 */
export const requestLogger = pinoHttp({
  logger,
  serializers: { req: redactAuthQuery },
  genReqId: (req, res) => {
    const inbound = req.headers["x-request-id"];
    const requestId =
      typeof inbound === "string" && inbound.length > 0
        ? inbound
        : randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
});
