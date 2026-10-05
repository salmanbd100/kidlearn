import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../../config/logger.js";

type SerializedRequest = { url?: string; query?: unknown };

/** better-auth carries credentials in query strings (OAuth `code`/`state`, reset tokens), so `/api/auth` is logged by path alone. */
export function redactAuthQuery<T extends SerializedRequest>(req: T): T {
  if (!req.url?.startsWith("/api/auth")) return req;

  const queryAt = req.url.indexOf("?");
  return {
    ...req,
    url: queryAt === -1 ? req.url : `${req.url.slice(0, queryAt)}?[redacted]`,
    query: undefined,
  };
}

/** Reuses an inbound `x-request-id` when a proxy assigned one, and echoes it on the response. */
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
