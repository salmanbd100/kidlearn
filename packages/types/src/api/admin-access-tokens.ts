import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** `/api/admin/access-tokens` — bearer credentials for an admin's own AI assistant over MCP (FR-AI-10). */
export const ACCESS_TOKEN_SCOPES = ["mcp:drafts"] as const;
export const AccessTokenScopeSchema = z.enum(ACCESS_TOKEN_SCOPES);
export type AccessTokenScope = z.infer<typeof AccessTokenScopeSchema>;

export const ACCESS_TOKEN_LIFETIME_DAYS = { default: 7, max: 30 } as const;

/** Enough for one per client on a few machines; a ceiling so a stolen session cannot mint credentials without limit. */
export const MAX_ACTIVE_ACCESS_TOKENS = 10;

/** A token as listed: never the secret, which exists only in the create response. */
export const AdminAccessTokenSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string(),
    scopes: z.array(AccessTokenScopeSchema),
    expiresAt: IsoDateTimeSchema,
    lastUsedAt: IsoDateTimeSchema.nullable(),
    revokedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export type AdminAccessToken = z.infer<typeof AdminAccessTokenSchema>;

export const CreateAdminAccessTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(ACCESS_TOKEN_LIFETIME_DAYS.max)
      .default(ACCESS_TOKEN_LIFETIME_DAYS.default),
  })
  .strict();

export type CreateAdminAccessTokenBody = z.input<
  typeof CreateAdminAccessTokenSchema
>;

export const CreatedAdminAccessTokenSchema = z
  .object({
    token: AdminAccessTokenSchema,
    /** The full `klat_…` value. Shown once; only its hash is stored. */
    secret: z.string(),
  })
  .strict();

export type CreatedAdminAccessToken = z.infer<
  typeof CreatedAdminAccessTokenSchema
>;

export const AdminAccessTokenListSchema = z
  .object({ tokens: z.array(AdminAccessTokenSchema) })
  .strict();

export type AdminAccessTokenList = z.infer<typeof AdminAccessTokenListSchema>;

export const AdminAccessTokenResponseSchema = ok(AdminAccessTokenSchema);
export const CreatedAdminAccessTokenResponseSchema = ok(
  CreatedAdminAccessTokenSchema,
);
export const AdminAccessTokenListResponseSchema = ok(
  AdminAccessTokenListSchema,
);
