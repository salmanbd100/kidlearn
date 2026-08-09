import { z } from "zod";
import { ActivityDefinitionSchema } from "../activity/schemas.js";
import { AssetKindSchema, LocaleSchema } from "../primitives.js";
import { QuizQuestionSchema } from "../quiz/schemas.js";
import { ok } from "./envelope.js";

/**
 * `/api/content` — the student-facing curriculum read API.
 *
 * Two properties of every schema here are worth reading before building against
 * them:
 *
 *  1. **Text is already resolved.** The server picks the child's
 *     `preferredLanguage` and falls back to English, then sends one string. A
 *     client never receives the other language's copy (FR-PROF-03), and never
 *     chooses a locale — there are no locale query parameters on this API.
 *  2. **Activity and quiz `definition` payloads are the exception.** They are
 *     passed through whole because they embed `LocalizedText`, and the engines in
 *     files 18–22 do their own locale picking via this package's parsers.
 */

/** A media reference flattened for the client — no ids of rows it cannot fetch. */
export const MediaSummarySchema = z
  .object({
    id: z.string(),
    url: z.string(),
    kind: AssetKindSchema,
  })
  .strict();

/**
 * Data-driven theming (FR-WORLD-05): a flat map of token name → CSS colour, e.g.
 * `{ primary: "#2E7D32", secondary: "#A5D6A7", background: "#F1F8E9" }`. Stored
 * as JSONB, so the flatness is a contract this schema asserts rather than
 * something the database enforces.
 */
export const PaletteSchema = z.record(z.string());

export const WorldSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    palette: PaletteSchema,
    mascot: MediaSummarySchema.nullable(),
  })
  .strict();

export const SubjectSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    sortOrder: z.number().int(),
    /**
     * Reserved contract field, always `null`: the settled schema has no
     * `Subject.iconAsset` column. Present so adding one is not a breaking change.
     */
    iconAsset: MediaSummarySchema.nullable(),
  })
  .strict();

export const TopicSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    sortOrder: z.number().int(),
  })
  .strict();

export const LessonListItemSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    worldId: z.string(),
    sortOrder: z.number().int(),
    /** Reserved, always `null` — the settled `Lesson` model has no such column. */
    thumbnailUrl: z.string().nullable(),
    /** Reserved, always `null` — as above. */
    durationEstimateSec: z.number().int().nullable(),
    /**
     * Reserved, always `null`: the child's-locale voice-over of `title`, which a
     * pre-reader needs to know what a tile says (NFR-A11Y-01). There is no
     * `LessonTranslation.nameAudioAsset` column yet — the voice pipeline in file
     * 36 adds one. Present now so the tile that speaks it is already wired.
     */
    nameAudioUrl: z.string().nullable(),
    /** Reserved, always `null` — file 16 joins `LessonProgress` per child here. */
    progress: z.null(),
  })
  .strict();

export const LessonActivitySchema = z
  .object({
    id: z.string(),
    type: z.string(),
    schemaVersion: z.number().int(),
    /** Validated against `ActivityDefinitionSchema` before it is served. */
    definition: ActivityDefinitionSchema,
  })
  .strict();

export const LessonQuizQuestionSchema = z
  .object({
    id: z.string(),
    /** The settled schema names this `format`, not `type`. */
    format: z.string(),
    schemaVersion: z.number().int(),
    sortOrder: z.number().int(),
    definition: QuizQuestionSchema,
  })
  .strict();

export const LessonQuizSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    questions: z.array(LessonQuizQuestionSchema),
  })
  .strict();

/** Everything the lesson player needs in one round trip. */
export const LessonDetailSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    worldId: z.string(),
    world: WorldSummarySchema,
    /** Which locale supplied `introScript`. The URLs fall back independently. */
    locale: LocaleSchema,
    introScript: z.string().nullable(),
    introAudioUrl: z.string().nullable(),
    videoUrl: z.string().nullable(),
    /**
     * `null` when the lesson has no activity, **or** when it points at one that
     * is not yet published — a published lesson referencing an in-review
     * activity is a normal state of the authoring workflow, so it is omitted and
     * logged rather than failing the request.
     */
    activity: LessonActivitySchema.nullable(),
    /** `null` under the same two conditions as `activity`. */
    quiz: LessonQuizSchema.nullable(),
    /** Reserved, always `null` — file 16 fills this in. */
    progress: z.null(),
  })
  .strict();

/**
 * One topic heading and the lessons of the requested world that sit under it.
 *
 * The grouping exists because `World` and `Topic` are orthogonal in the settled
 * schema: a lesson belongs to exactly one topic (its place in the curriculum,
 * authored subject → topic → lesson) and to exactly one world (its setting).
 * The student home screen navigates by world, so the world screen needs both —
 * and carrying the headings alongside the lessons is what saves it a round trip
 * per topic.
 */
export const WorldTopicLessonsSchema = TopicSummarySchema.extend({
  lessons: z.array(LessonListItemSchema),
}).strict();

export const WorldListResponseSchema = ok(
  z.object({ worlds: z.array(WorldSummarySchema) }).strict(),
);
export const WorldLessonsResponseSchema = ok(
  z.object({ topics: z.array(WorldTopicLessonsSchema) }).strict(),
);
export const SubjectListResponseSchema = ok(
  z.object({ subjects: z.array(SubjectSummarySchema) }).strict(),
);
export const TopicListResponseSchema = ok(
  z.object({ topics: z.array(TopicSummarySchema) }).strict(),
);
export const LessonListResponseSchema = ok(
  z.object({ lessons: z.array(LessonListItemSchema) }).strict(),
);
export const LessonDetailResponseSchema = ok(
  z.object({ lesson: LessonDetailSchema }).strict(),
);

/**
 * Payload types for the client.
 *
 * Exported so `apps/web` names a world or a lesson tile with the same type the
 * route test asserts the real body against, rather than declaring its own
 * (`backend.md §7` — a response shape has one definition).
 */
export type WorldSummaryResponse = z.infer<typeof WorldSummarySchema>;
export type TopicSummaryResponse = z.infer<typeof TopicSummarySchema>;
export type LessonListItemResponse = z.infer<typeof LessonListItemSchema>;
export type WorldTopicLessonsResponse = z.infer<typeof WorldTopicLessonsSchema>;
