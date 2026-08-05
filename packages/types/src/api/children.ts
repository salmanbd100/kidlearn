import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/children` — the parent's learner profiles (FR-PROF-01..07).
 *
 * `GRADE_LEVELS` mirrors Prisma's `GradeLevel` enum by hand, because this package
 * may not depend on `@kidlearn/db` (see the module docstring in `../index.ts`).
 * The mirror is not left on trust: `apps/server/src/openapi/paths/children.ts`
 * carries a compile-time assertion that the two still agree, so adding a grade
 * to the schema without adding it here fails `pnpm typecheck`.
 */
export const GRADE_LEVELS = ["NURSERY", "KG1", "KG2"] as const;
export const GradeLevelSchema = z.enum(GRADE_LEVELS);
export type GradeLevelValue = z.infer<typeof GradeLevelSchema>;

/**
 * Placeholder counters so the profile card renders in its final shape from day
 * one (FR-PROF-04). The server returns zeros until files 23–24 wire the reward
 * ledger and streaks; the response contract does not change when they do.
 */
export const ChildStatsSchema = z
  .object({
    stars: z.number().int().nonnegative(),
    coins: z.number().int().nonnegative(),
    badges: z.number().int().nonnegative(),
    currentStreak: z.number().int().nonnegative(),
  })
  .strict();

/**
 * The subset of a child profile that goes over HTTP. `parentId` is absent by
 * design (NFR-SAFE-02) and any column added to the model later stays invisible
 * until it is listed here deliberately.
 */
export const ChildProfileSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    age: z.number().int(),
    gradeLevel: GradeLevelSchema,
    preferredLanguage: LocaleSchema,
    avatarCharacterId: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    stats: ChildStatsSchema,
  })
  .strict();

export type ChildProfileResponse = z.infer<typeof ChildProfileSchema>;

export const ActiveChildSchema = z
  .object({ activeChildProfileId: z.string() })
  .strict();

export const ChildProfileResponseSchema = ok(ChildProfileSchema);
/** Oldest profile first. */
export const ChildProfileListResponseSchema = ok(z.array(ChildProfileSchema));
export const ActiveChildResponseSchema = ok(ActiveChildSchema);
