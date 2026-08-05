/**
 * Request schemas for `/api/children`.
 *
 * These live in `apps/server` rather than `packages/types` on purpose: they
 * validate HTTP request shapes for one consumer, whereas `packages/types` is
 * reserved for payloads a second consumer also parses (activity/quiz JSON, read
 * by the web renderer and the AI generators as well as the API).
 */
import { GradeLevel, Language } from "@kidlearn/db";
import { z } from "zod";

/**
 * Grade and language come straight off the Prisma enums rather than being
 * retyped as string literals, so the accepted wire values cannot drift from the
 * database (`general.md §2`: never redeclare a Prisma type in application code).
 *
 * Note the casing: this file's spec wrote `nursery | kg1 | kg2`, but the enum
 * that shipped in file 03 — and that `document/database-design.md §enums`
 * documents — is `NURSERY | KG1 | KG2`. The database wins, so the API speaks
 * uppercase grades. `Language` really is lowercase `en | bn`.
 */
export const GradeLevelSchema = z.nativeEnum(GradeLevel);
export const LanguageSchema = z.nativeEnum(Language);

/** Youngest and oldest learner the platform is designed for (spec §2). */
const MIN_AGE = 3;
const MAX_AGE = 6;
const MAX_FIRST_NAME_LENGTH = 50;

export const CreateChildBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(MAX_FIRST_NAME_LENGTH),
    age: z.number().int().min(MIN_AGE).max(MAX_AGE),
    gradeLevel: GradeLevelSchema,
    preferredLanguage: LanguageSchema,
    // `ChildProfile.avatarCharacterId` is nullable in the database so the
    // column can survive a character being retired, but the API requires it:
    // every child picks an avatar during creation (FR-PROF-02), and a profile
    // with no avatar has no valid rendering on the student home screen.
    avatarCharacterId: z.string().min(1),
  })
  // `.strict()` rather than Zod's default key-stripping: silently discarding
  // `parentId` would make a reassignment attempt look like it succeeded.
  .strict();

export const UpdateChildBodySchema = CreateChildBodySchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: "At least one field required" },
);

export const ChildIdParamsSchema = z.object({ id: z.string().min(1) });

export type CreateChildBody = z.infer<typeof CreateChildBodySchema>;
export type UpdateChildBody = z.infer<typeof UpdateChildBodySchema>;
