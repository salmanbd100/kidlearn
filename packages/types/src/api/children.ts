import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** `/api/children` — the parent's learner profiles (FR-PROF-01..07). */
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

/**
 * An avatar a brand-new profile is allowed to wear, as listed by
 * `GET /api/characters`.
 */
export const AvatarCharacterSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
  })
  .strict();

export type AvatarCharacterResponse = z.infer<typeof AvatarCharacterSchema>;

/** A character as one particular child sees it (FR-GAM-05). */
export const CharacterUnlockSchema = AvatarCharacterSchema.extend({
  isDefault: z.boolean(),
  isUnlocked: z.boolean(),
}).strict();

export type CharacterUnlockResponse = z.infer<typeof CharacterUnlockSchema>;

// The child-profile write contracts.

/** Youngest and oldest learner the platform is designed for (spec §2). */
export const MIN_CHILD_AGE = 3;
export const MAX_CHILD_AGE = 6;
export const MAX_CHILD_FIRST_NAME_LENGTH = 50;

export const ChildProfileCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(MAX_CHILD_FIRST_NAME_LENGTH),
    age: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE),
    gradeLevel: GradeLevelSchema,
    preferredLanguage: LocaleSchema,
    // `ChildProfile.avatarCharacterId` is nullable in the database so the column
    // can survive a character being retired, but the API requires it: every
    // child picks an avatar during creation (FR-PROF-02), and a profile with no
    // avatar has no valid rendering on the student home screen.
    avatarCharacterId: z.string().min(1),
  })
  // `.strict()` rather than Zod's default key-stripping: silently discarding
  // `parentId` would make a reassignment attempt look like it succeeded.
  .strict();

export type ChildProfileCreate = z.infer<typeof ChildProfileCreateSchema>;

export const ChildProfileUpdateSchema =
  ChildProfileCreateSchema.partial().refine(
    (body) => Object.keys(body).length > 0,
    { message: "At least one field required" },
  );

export type ChildProfileUpdate = z.infer<typeof ChildProfileUpdateSchema>;

export const ChildProfileResponseSchema = ok(ChildProfileSchema);
/** Oldest profile first. */
export const ChildProfileListResponseSchema = ok(z.array(ChildProfileSchema));
export const ActiveChildResponseSchema = ok(ActiveChildSchema);
export const AvatarCharacterListResponseSchema = ok(
  z.array(AvatarCharacterSchema),
);
/** Alphabetical by name, so the picker's order is stable as characters unlock. */
export const CharacterUnlockListResponseSchema = ok(
  z.object({ characters: z.array(CharacterUnlockSchema) }).strict(),
);
