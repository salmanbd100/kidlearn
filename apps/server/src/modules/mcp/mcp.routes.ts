import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Prisma } from "@kidlearn/db";
import { toWebRequest } from "@modelcontextprotocol/node";
import { type AuthInfo, createMcpHandler } from "@modelcontextprotocol/server";
import { type RequestHandler, Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ApiError } from "../../shared/errors/errors.js";
import { apiRateLimit } from "../../shared/middleware/security.js";
import { asRecord } from "../../shared/utils/json-record.js";
import {
  MCP_DRAFTS_SCOPE,
  type McpPrincipal,
  resolveMcpPrincipal,
} from "./mcp.auth.js";
import { buildMcpServer, type McpCaller } from "./mcp.server.js";

// The 2026-07-28 revision carries client info on every request, under this `_meta` key.
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";

// Stateless and JSON-only (D3). 2025-era clients are still served, each request by a fresh server: rejecting
// them would lock out every assistant that has not moved to the new revision yet.
const mcpHandler = createMcpHandler(
  ({ authInfo }) => buildMcpServer(callerFrom(authInfo)),
  {
    legacy: "stateless",
    responseMode: "json",
    onerror: (error) => logger.warn({ err: error }, "mcp request failed"),
  },
);

export const mcpRouter = Router();

/** Resolved before the per-principal limit, which is keyed by it; a token is re-checked on every request. */
const authenticate: RequestHandler = async (req, res, next) => {
  try {
    res.locals.mcpPrincipal = await resolveMcpPrincipal(
      req.headers.authorization,
    );
    next();
  } catch (error) {
    const challenge = challengeFor(error, req.headers.authorization);
    if (challenge !== undefined) res.setHeader("WWW-Authenticate", challenge);
    next(error);
  }
};

/** RFC 6750 §3: no error code when no credential was sent; `insufficient_scope` on a scope refusal. */
function challengeFor(
  error: unknown,
  authorization: string | undefined,
): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.statusCode === 401) {
    return authorization === undefined
      ? 'Bearer realm="kidlearn"'
      : 'Bearer realm="kidlearn", error="invalid_token"';
  }
  if (error.statusCode === 403 && isScopeRefusal(error.details)) {
    return `Bearer realm="kidlearn", error="insufficient_scope", scope="${MCP_DRAFTS_SCOPE}"`;
  }
  return undefined;
}

function isScopeRefusal(details: unknown): boolean {
  return (
    typeof details === "object" &&
    details !== null &&
    "requiredScope" in details
  );
}

const principalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.MCP_RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Per admin, not per token: an admin holding several tokens shares one allowance.
  keyGenerator: (_req, res) => principalOf(res.locals).adminId,
  handler: (_req, _res, next) => {
    next(
      new ApiError(429, "RATE_LIMITED", "Too many MCP requests — slow down"),
    );
  },
});

mcpRouter.post(
  "/mcp",
  // Per IP first, so an unauthenticated caller cannot guess tokens at the speed of the database.
  apiRateLimit(env.API_RATE_LIMIT_PER_MINUTE),
  authenticate,
  principalRateLimit,
  async (req, res, next) => {
    try {
      const principal = principalOf(res.locals);
      const caller: McpCaller = {
        principal,
        client: readClientInfo(req.body, req.headers["user-agent"]),
        log: req.log.child({ adminId: principal.adminId }),
      };
      const authInfo: AuthInfo = {
        token: caller.principal.tokenId,
        clientId: caller.principal.adminId,
        scopes: caller.principal.scopes,
        extra: { caller },
      };

      const response = await mcpHandler.fetch(
        await toWebRequest(req, req.body),
        { authInfo, parsedBody: req.body },
      );

      res.status(response.status);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      if (response.body === null) {
        res.end();
        return;
      }
      // The DOM and `node:stream/web` declare two `ReadableStream` types for the one runtime class.
      Readable.fromWeb(response.body as NodeReadableStream).pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

// Stateless: no session to resume with GET or end with DELETE.
mcpRouter.all("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST");
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    "The MCP endpoint is stateless; send each message as a POST",
  );
});

function principalOf(locals: Record<string, unknown>): McpPrincipal {
  const principal = locals.mcpPrincipal;
  if (principal === undefined) throw ApiError.unauthorized();
  // Set by `authenticate` above, which every route on this router runs first.
  return principal as McpPrincipal;
}

function callerFrom(authInfo: AuthInfo | undefined): McpCaller {
  const caller = authInfo?.extra?.caller;
  if (caller === undefined) throw ApiError.unauthorized();
  // `extra` is the route's own pass-through; it holds what the handler above put there and nothing else.
  return caller as McpCaller;
}

/**
 * The client's self-description, for the reviewer's provenance label (Req. 7). 2026-07-28 clients send it with
 * every request; 2025-era ones only at `initialize`, which a stateless server never sees again, so their
 * `User-Agent` stands in. Either way it is a label, never an identity.
 */
export function readClientInfo(
  body: unknown,
  userAgent: string | undefined,
): Prisma.JsonObject | null {
  const meta = asRecord(asRecord(asRecord(body).params)._meta);
  const info = asRecord(meta[CLIENT_INFO_META_KEY]);
  const name =
    typeof info.name === "string" ? info.name.slice(0, 100) : undefined;
  if (name !== undefined) {
    return {
      name,
      version:
        typeof info.version === "string" ? info.version.slice(0, 50) : null,
    };
  }

  const product = userAgent?.trim().split(/\s+/)[0];
  if (product === undefined || product === "") return null;
  const [agentName, agentVersion] = product.split("/");
  return {
    name: agentName.slice(0, 100),
    version: agentVersion?.slice(0, 50) ?? null,
  };
}
