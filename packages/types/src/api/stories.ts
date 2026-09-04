import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { WorldSummarySchema } from "./content.js";
import { ok } from "./envelope.js";

/**
 * `/api/content/stories` — the Story Library read API (FR-STORY-01, 04, 05, 08).
 */

export const StorySummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    /** Resolved to the child's locale, falling back to English (FR-STORY-05). */
    title: z.string(),
    /**
     * The title read aloud, so a pre-reader can find out what a cover says
     * before opening it (NFR-A11Y-01). `null` until the voice pipeline (file 36)
     * records one for this story in this locale.
     */
    titleAudioUrl: z.string().nullable(),
    /** Which locale supplied `title`. `titleAudioUrl` falls back independently. */
    locale: LocaleSchema,
    /** The world the story is set in — the cover's theming comes from here. */
    world: WorldSummarySchema,
    /** `null` while the story has no cover art (AI pipeline, files 35–37). */
    coverImageUrl: z.string().nullable(),
    pageCount: z.number().int(),
    /** Whether this child has finished this story before. */
    completed: z.boolean(),
  })
  .strict();

/**
 * One highlightable run of `StoryPage.text`, as character offsets into it plus
 * the moment the narration reaches it.
 */
export const NarrationSpanSchema = z
  .object({
    /** Inclusive character offset into the page's `text`. */
    start: z.number().int().nonnegative(),
    /** Exclusive character offset. */
    end: z.number().int().nonnegative(),
    /** Milliseconds from the start of the narration clip. */
    tMs: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Word- or sentence-level narration timing, for the reader's follow-along
 * highlight (FR-STORY-02).
 */
export const NarrationTimingsSchema = z
  .object({
    unit: z.enum(["word", "sentence"]),
    /** In playback order. An empty array is treated exactly as `null`. */
    spans: z.array(NarrationSpanSchema),
  })
  .strict();

export type NarrationSpan = z.infer<typeof NarrationSpanSchema>;
export type NarrationTimings = z.infer<typeof NarrationTimingsSchema>;

export const StoryPageSchema = z
  .object({
    /**
     * 1-based reading position. Derived from the row's `sortOrder`, which is what
     * the `@@unique([storyId, sortOrder])` constraint is on — the API speaks in
     * page numbers because that is what a reader turns.
     */
    pageNumber: z.number().int(),
    /** `null` while the page has no illustration yet (files 35–37). */
    illustrationUrl: z.string().nullable(),
    /** Resolved to the child's locale, falling back to English. */
    text: z.string(),
    /**
     * Page narration in the locale `text` came from, or English if only that was
     * recorded (FR-STORY-02). `null` when neither locale has audio — the reader
     * (file 26) then shows the page without narration rather than blocking on it.
     */
    narrationUrl: z.string().nullable(),
    /** Timing metadata for `narrationUrl`, when the recording has any. */
    narrationTimings: NarrationTimingsSchema.nullable(),
  })
  .strict();

export const StoryDetailSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    /**
     * The story's moral or learning theme (FR-STORY-03), resolved to the child's
     * locale. `null` when no locale has a translated moral — the untranslated
     * `Story.theme` is an authoring label and is not served to a child.
     */
    moral: z.string().nullable(),
    /** The moral read aloud, for the reader's finish screen (FR-STORY-03). */
    moralAudioUrl: z.string().nullable(),
    world: WorldSummarySchema,
    coverImageUrl: z.string().nullable(),
    /** Which locale supplied `title` and `moral`; pages resolve independently. */
    locale: LocaleSchema,
    /** Ordered by `pageNumber`, ascending. */
    pages: z.array(StoryPageSchema),
    completed: z.boolean(),
  })
  .strict();

export const StoryListResponseSchema = ok(
  z.object({ stories: z.array(StorySummarySchema) }).strict(),
);
export const StoryDetailResponseSchema = ok(
  z.object({ story: StoryDetailSchema }).strict(),
);

export type StorySummaryResponse = z.infer<typeof StorySummarySchema>;
export type StoryPageResponse = z.infer<typeof StoryPageSchema>;
export type StoryDetailResponse = z.infer<typeof StoryDetailSchema>;
