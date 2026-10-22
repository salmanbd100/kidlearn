import { createHash, randomBytes } from "node:crypto";
import type { AdminAccessToken as AdminAccessTokenRow } from "@kidlearn/db";
import {
  ACCESS_TOKEN_SCOPES,
  type AccessTokenScope,
  type AdminAccessToken,
} from "@kidlearn/types";
import { prisma } from "../../../config/prisma.js";
import { ApiError } from "../../../shared/errors/errors.js";

export const ACCESS_TOKEN_PREFIX = "klat_";

/** `klat_` plus seven secret characters: enough to tell two tokens apart, nowhere near enough to guess one. */
const DISPLAY_PREFIX_LENGTH = ACCESS_TOKEN_PREFIX.length + 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Enough for one per client on a few machines; a ceiling so a stolen session cannot mint credentials without limit. */
export const MAX_ACTIVE_ACCESS_TOKENS = 10;

// `Date` where the contract says ISO string; `res.json()` does the conversion.
export type AdminAccessTokenDto = Omit<
  AdminAccessToken,
  "expiresAt" | "lastUsedAt" | "revokedAt" | "createdAt"
> & {
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export function hashAccessToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function isAccessTokenScope(value: string): value is AccessTokenScope {
  return (ACCESS_TOKEN_SCOPES as readonly string[]).includes(value);
}

function toDto(row: AdminAccessTokenRow): AdminAccessTokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes.filter(isAccessTokenScope),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export async function listAccessTokens(
  adminId: string,
): Promise<AdminAccessTokenDto[]> {
  const rows = await prisma.adminAccessToken.findMany({
    where: { adminId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function createAccessToken(
  adminId: string,
  input: { name: string; expiresInDays: number },
  now = new Date(),
): Promise<{ token: AdminAccessTokenDto; secret: string }> {
  const active = await prisma.adminAccessToken.count({
    where: { adminId, revokedAt: null, expiresAt: { gt: now } },
  });
  if (active >= MAX_ACTIVE_ACCESS_TOKENS) {
    throw ApiError.conflict(
      `You already have ${MAX_ACTIVE_ACCESS_TOKENS} active access tokens; revoke one before creating another`,
    );
  }

  // 32 random bytes: the token is the whole credential, so it carries its own entropy rather than relying on the hash.
  const secret = `${ACCESS_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

  const row = await prisma.adminAccessToken.create({
    data: {
      adminId,
      name: input.name,
      prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH),
      tokenHash: hashAccessToken(secret),
      scopes: [...ACCESS_TOKEN_SCOPES],
      expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
    },
  });

  return { token: toDto(row), secret };
}

/** Another admin's token is a 404, not a 403: the id of a credential is not something to confirm to anyone else. */
export async function revokeAccessToken(
  adminId: string,
  tokenId: string,
  now = new Date(),
): Promise<AdminAccessTokenDto> {
  const row = await prisma.adminAccessToken.findFirst({
    where: { id: tokenId, adminId },
  });
  if (!row) throw ApiError.notFound("No such access token");
  if (row.revokedAt !== null) return toDto(row);

  const revoked = await prisma.adminAccessToken.update({
    where: { id: row.id },
    data: { revokedAt: now },
  });
  return toDto(revoked);
}
