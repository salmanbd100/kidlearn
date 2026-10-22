import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { hasNonCredentialAccount } from "../../shared/middleware/require-admin.js";
import {
  ACCESS_TOKEN_PREFIX,
  hashAccessToken,
} from "../admin/access-tokens/access-tokens.service.js";

export const MCP_DRAFTS_SCOPE = "mcp:drafts";

/** Who an MCP call acts for. Resolved on every request; nothing about it is cached between calls. */
export interface McpPrincipal {
  adminId: string;
  adminName: string;
  tokenId: string;
  scopes: string[];
}

// Written at most this often: a busy assistant would otherwise turn every tool call into a write.
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

function bearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1];
}

/**
 * Every check `requireAdmin` makes that still means something without a session, re-run per request so a
 * revoked token, a removed admin or a linked Google account loses access on the next call.
 */
export async function resolveMcpPrincipal(
  authorization: string | undefined,
  now = new Date(),
): Promise<McpPrincipal> {
  const secret = bearerToken(authorization);
  if (secret === undefined || !secret.startsWith(ACCESS_TOKEN_PREFIX)) {
    throw ApiError.unauthorized("An admin access token is required");
  }

  const token = await prisma.adminAccessToken.findUnique({
    where: { tokenHash: hashAccessToken(secret) },
    include: { admin: true },
  });
  // One message for unknown, revoked and expired: which one it was is not the caller's to learn.
  if (
    !token ||
    token.revokedAt !== null ||
    token.expiresAt.getTime() <= now.getTime()
  ) {
    throw ApiError.unauthorized("Access token is invalid, revoked or expired");
  }

  // A removed admin's tokens cascade away with the `AdminUser` row; a null `authUserId` means their better-auth
  // user was deleted, which leaves the row (for its review history) but no one who could sign in as it.
  const authUserId = token.admin.authUserId;
  if (authUserId === null || (await hasNonCredentialAccount(authUserId))) {
    throw ApiError.forbidden("Admin access required");
  }

  if (!token.scopes.includes(MCP_DRAFTS_SCOPE)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      `Access token lacks the ${MCP_DRAFTS_SCOPE} scope`,
      { requiredScope: MCP_DRAFTS_SCOPE },
    );
  }

  if (
    token.lastUsedAt === null ||
    now.getTime() - token.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    await prisma.adminAccessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: now },
    });
  }

  return {
    adminId: token.admin.id,
    adminName: token.admin.name,
    tokenId: token.id,
    scopes: token.scopes,
  };
}
