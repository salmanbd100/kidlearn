import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { WorldSummarySchema } from "./content.js";
import { ok } from "./envelope.js";

/**
 * `/api/content/stories` — the Story Library read API (FR-STORY-01, 04, 05, 08).
 *
 * The two properties described in `content.ts` hold here too: every string is
 * already resolved to one locale server-side, and this API takes no query
 * parameters, so a client can neither choose a language nor widen what a child
 * sees.
 *
 * What is specific to stories:
 *
 *  - **`world` is the whole world row, not a slug enum.** A story's setting is a
 *    `World` FK, and the world carries the `palette` and mascot the cover is
 *    themed from (FR-STORY-04). Serving the row rather than a
 *    `"jungle" | "ocean" | "space"` literal is what keeps a fourth world a
 *    database insert, the same property `WorldSummary` already has on the home
 *    screen (FR-WORLD-05).
 *  - **`completed` is derived from the reward ledger**, not from a story-progress
 *    table. The `sourceType: "story_completion"` grant that file 26 writes once
 *    per story per child *is* the completion record — see `StorySummary.completed`.
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
    /**
     * Whether this child has finished this story before.
     *
     * True exactly when a `RewardLedger` row exists for them with
     * `sourceType: "story_completion"` and `sourceId` this story — the grant file
     * 26 writes once, guarded by the ledger's unique index. There is deliberately
     * no `StoryProgress` table: one record of "this child finished this story",
     * not two that can disagree.
     *
     * It is a badge on the cover and never a lock. Replays are free (FR-STORY-06),
     * so a completed story opens exactly like an unread one.
     */
    completed: z.boolean(),
  })
  .strict();

/**
 * One highlightable run of `StoryPage.text`, as character offsets into it plus
 * the moment the narration reaches it.
 *
 * Offsets rather than pre-split tokens because the text is served whole: a client
 * that had to re-tokenise it to line spans up would have to agree with whatever
 * split the voice pipeline used, in two languages, one of which does not put
 * spaces where English does.
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
 *
 * **Always `null` in MVP content.** The render path ships now and the data lands
 * with the voice pipeline (file 36), so the reader has one component that
 * highlights when it is given timings and renders plain text when it is not —
 * rather than a second reading screen written later.
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
    /**
     * Timing metadata for `narrationUrl`, when the recording has any.
     *
     * Resolved from the *same* translation row `narrationUrl` came from, never
     * from the other locale: spans are character offsets into one language's
     * text, and English offsets over Bangla text would highlight nonsense.
     */
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
    /**
     * The moral read aloud, for the reader's finish screen (FR-STORY-03).
     *
     * Falls back independently of `moral`, exactly as `titleAudioUrl` does on a
     * cover: a moral translated into Bangla but recorded only in English is still
     * better spoken than silent, and the moral is the one line of a story a
     * pre-reader could otherwise never receive. `null` until file 36 records it.
     */
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
