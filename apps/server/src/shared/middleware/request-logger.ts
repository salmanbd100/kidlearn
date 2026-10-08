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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The header is client-controlled: anything but a UUID could forge log lines, collide with another request's id, or bloat every entry. */
export function requestIdFrom(inbound: string | string[] | undefined): string {
  return typeof inbound === "string" && UUID_PATTERN.test(inbound)
    ? inbound
    : randomUUID();
}

/** Reuses an inbound `x-request-id` when a proxy assigned a UUID, and echoes it on the response. */
export const requestLogger = pinoHttp({
  logger,
  serializers: { req: redactAuthQuery },
  genReqId: (req, res) => {
    const requestId = requestIdFrom(req.headers["x-request-id"]);
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
});
