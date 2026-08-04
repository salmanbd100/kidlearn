import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.js";

/**
 * Structured request logging. Every request gets a correlation id — reused
 * from an inbound `x-request-id` when a proxy already assigned one — which is
 * echoed back on the response and attached to `req.log` for downstream use.
 */
export const requestLogger = pinoHttp({
  logger,
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
