/**
 * Route-boundary schemas for `/api/admin/ai/*` (file 34, FR-AI-01).
 *
 * `GradeLevelSchema` and `LocaleSchema` are re-exported from `@kidlearn/types`
 * rather than rebuilt, matching `schemas/admin-content.ts` and
 * `schemas/admin-media.ts`: one spelling of a grade and a locale across the
 * request, the database and the payload contracts.
 *
 * **No `status` key, and `.strict()`.** Same rule the curriculum bodies hold, for
 * a sharper reason here: a generated lesson may only ever be created as a draft
 * (FR-AI-07), so a body that could name a status would be a door around the
 * review queue that has not even been built yet.
 */
import { GradeLevelSchema, LocaleSchema } from "@kidlearn/types";
import { z } from "zod";

/**
 * What the generator is asked for.
 *
 * One grade, not a set, unlike the hand-authored lesson body: the prompt writes
 * for a reading age, and "Nursery and KG-2" is a request for two lessons. The
 * created row still carries a `gradeLevels` array, holding exactly this one.
 *
 * `worldId` is optional because the topic's existing lessons usually settle it.
 * When a topic has none, the request is refused rather than defaulted — a lesson
 * themed into the wrong world is wrong on a child's home screen, and there is no
 * safe guess to make.
 *
 * `languages` is a non-empty set with no duplicates: it decides which locale keys
 * the model's answer must carry, so a repeated `en` would ask for the same script
 * twice and a missing one would generate a lesson nobody can read.
 */
export const GenerateLessonSchema = z
  .object({
    gradeLevel: GradeLevelSchema,
    subjectId: z.string().uuid(),
    topicId: z.string().uuid(),
    worldId: z.string().uuid().optional(),
    lessonFocus: z.string().min(3).max(200),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
  })
  .strict();

export type GenerateLessonBody = z.infer<typeof GenerateLessonSchema>;
