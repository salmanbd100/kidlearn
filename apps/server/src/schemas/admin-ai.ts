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
import {
  AiJobStatusSchema,
  AiJobTypeSchema,
  GradeLevelSchema,
  LocaleSchema,
  NarrationEntitySchema,
} from "@kidlearn/types";
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

/**
 * What the story generator is asked for (file 35, FR-AI-02).
 *
 * **Grade levels are a set here, unlike the lesson body's single grade.** A story
 * is read aloud to whoever is listening — the reading age shapes the sentence
 * length, not the story itself — and `Story.gradeLevels` is an array for that
 * reason. The lesson generator's one-grade rule exists because a *lesson* teaches
 * to a level; a story does not.
 *
 * `worldId` is required rather than inherited: a story has no topic to inherit
 * from, and the world is what decides whether the characters are jungle animals
 * or sea creatures.
 *
 * `pageCount` is bounded 6–8 because that is the length a 3–6 year old sits
 * through, and the bound is enforced again in the output schema as an exact array
 * length — a request for seven pages that came back with nine is retried.
 */
export const GenerateStorySchema = z
  .object({
    gradeLevels: z
      .array(GradeLevelSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "gradeLevels must not repeat",
      ),
    theme: z.string().min(3).max(200),
    worldId: z.string().uuid(),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
    pageCount: z.number().int().min(6).max(8).optional(),
  })
  .strict();

export type GenerateStoryBody = z.infer<typeof GenerateStorySchema>;

/**
 * What the quiz generator is asked for (file 35, FR-AI-03).
 *
 * No grade level and no world: both come from the lesson, which is the point of
 * generating against one. A body that could name a grade would be a way to ask
 * for questions pitched at an age the lesson was not written for.
 *
 * `count` is bounded 3–5 by FR-QUIZ-01 and defaulted in the service rather than
 * here, so the default lives next to the prompt that has to state it.
 */
export const GenerateQuizSchema = z
  .object({
    lessonId: z.string().uuid(),
    count: z.number().int().min(3).max(5).optional(),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
  })
  .strict();

export type GenerateQuizBody = z.infer<typeof GenerateQuizSchema>;

/**
 * Which content to narrate (file 36, FR-AI-04, FR-I18N-05).
 *
 * Two fields, and no language among them. **The locales are computed, not
 * requested**: the server looks for every `(target, locale)` pair that has text
 * and no audio, so an admin cannot ask for a Bangla clip on a page that has no
 * Bangla text, nor re-record a clip that already exists by naming its language.
 * Asking for "the missing narration" is the only request that has a correct
 * answer here — anything narrower is a way to produce a story that is half
 * narrated and looks finished.
 *
 * `entity` is `lesson | story | quiz` and `id` is that row's id, not a
 * translation's. Which of the three tables holds the audio key is the server's
 * business, and it differs per entity.
 */
export const GenerateNarrationSchema = z
  .object({ entity: NarrationEntitySchema, id: z.string().uuid() })
  .strict();

export type GenerateNarrationBody = z.infer<typeof GenerateNarrationSchema>;

/**
 * Which story to illustrate (file 36, FR-AI-05, FR-AI-09).
 *
 * One field. No page list and no prompt: the pages worth drawing are the ones
 * carrying an `illustrationPrompt` and no illustration, and the prompt itself is
 * the brief the story generator already wrote plus the world's character sheets.
 * A caller-supplied prompt would be a way to draw a picture no character sheet
 * was applied to, which is FR-AI-09 defeated in one request.
 */
export const GenerateIllustrationsSchema = z
  .object({ storyId: z.string().uuid() })
  .strict();

export type GenerateIllustrationsBody = z.infer<
  typeof GenerateIllustrationsSchema
>;

// --- The review queue (file 37, FR-AI-07, FR-CMS-05..06) ------------------

/**
 * Which jobs to list.
 *
 * `status` defaults to `awaiting_review` because that is the queue — the other
 * statuses are the archive, reachable by asking for them. Every filter is
 * optional and none of them widens anything: an admin already sees every job.
 *
 * `language` and `gradeLevel` are matched against the job's `input` JSON rather
 * than against a column, because that is where the generator recorded what it was
 * asked for and duplicating it into columns would be a second source of truth
 * about a request that has already happened. They match only the jobs whose input
 * carries them: the two media generators record a clip's locale under a different
 * key and no grade at all, so filtering by grade narrows to the text jobs by
 * construction. That is the useful behaviour — "KG1 lessons awaiting review" is
 * the question, and a narration clip has no reading age.
 *
 * `take`/`skip` are strings on the wire and coerced here; `z.number()` would
 * reject every request that used them.
 */
const PositiveIntSchema = z.coerce.number().int().min(1);

export const AiJobListQuerySchema = z
  .object({
    status: AiJobStatusSchema.optional().default("awaiting_review"),
    type: AiJobTypeSchema.optional(),
    language: LocaleSchema.optional(),
    gradeLevel: GradeLevelSchema.optional(),
    take: PositiveIntSchema.max(100).optional().default(25),
    skip: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

export type AiJobListQuery = z.infer<typeof AiJobListQuerySchema>;

export const AiJobIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export type AiJobIdParams = z.infer<typeof AiJobIdParamsSchema>;

/**
 * Why the reviewer refused (FR-AI-08).
 *
 * **Mandatory, and ten characters is the floor rather than one.** "no" and "bad"
 * are rejections that record nothing: the person who regenerates the content has
 * to change the prompt, and the only part of a rejection that tells them how is
 * the sentence explaining what was wrong. A minimum long enough to need a verb is
 * the cheapest way to ask for one.
 */
export const RejectJobSchema = z
  .object({ reason: z.string().trim().min(10).max(2000) })
  .strict();

export type RejectJobBody = z.infer<typeof RejectJobSchema>;

/**
 * `?jobId=…` on a content or editor mutation — the edit-then-approve breadcrumb
 * (requirement 5).
 *
 * The queue's Edit button deep-links into the file-33 editors carrying the job it
 * came from, and saving there is what records `edit_then_approve` on that job. The
 * recording rides on the save request rather than following it as a second call,
 * so the two cannot come apart: a client that crashed between them would leave a
 * rewritten lesson claiming nobody had rewritten it (FR-AI-08).
 *
 * Optional everywhere, because every one of these routes is also reached from the
 * ordinary CMS with no job in sight.
 */
export const JobBreadcrumbQuerySchema = z
  .object({ jobId: z.string().uuid().optional() })
  .strict();

export type JobBreadcrumbQuery = z.infer<typeof JobBreadcrumbQuerySchema>;
