import type { ChildProfile, MediaAsset, Prisma } from "@kidlearn/db";
import type {
  NarrationTimings,
  StoryDetailResponse,
  StorySummaryResponse,
} from "@kidlearn/types";
import { NarrationTimingsSchema } from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { type Lang, pickLocale, toLocaleMap } from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import {
  publishedForChild,
  publishedRelation,
} from "../lib/published-for-child.js";
import type { GrantSource } from "./rewardService.js";

// The Story Library's read side (FR-STORY-01, 04, 05, 08).

/**
 * Read, not written, here — the grant itself is file 26's. Pinned to
 * `GrantSource` so the string this file filters on and the string that file writes
 * cannot drift apart into a flag that is silently always `false`.
 */
const STORY_COMPLETION: GrantSource = "story_completion";

type StoryWorld = {
  id: string;
  slug: string;
  name: string;
  palette: Prisma.JsonValue;
  mascotAsset: MediaAsset | null;
  translations?: { language: Lang; name: string }[];
};

type StoryTranslationRow = {
  language: Lang;
  title: string;
  moral: string | null;
  titleAudioAsset?: { url: string } | null;
  moralAudioAsset?: { url: string } | null;
};

/**
 * The columns the mappers below read. `Story.theme` is deliberately absent: it is
 * the authoring label for the moral and nothing here may serve it to a child.
 */
type StoryRow = {
  id: string;
  slug: string;
  title: string;
  coverAsset: { url: string } | null;
  world: StoryWorld;
  translations: StoryTranslationRow[];
};

/**
 * `World.palette` is free-form JSONB; the response contract publishes a flat
 * `Record<string, string>`. Narrowed by conversion rather than by an `as` cast so
 * the contract is *made* true instead of asserted: a palette an admin saved with a
 * nested object or a number drops that entry, and the card falls back to the
 * theme's own surface rather than emitting `linear-gradient(undefined, …)`.
 */
function toPalette(value: Prisma.JsonValue): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const palette: Record<string, string> = {};
  for (const [token, colour] of Object.entries(value)) {
    if (typeof colour === "string") palette[token] = colour;
  }
  return palette;
}

/**
 * `StoryPageTranslation.narrationTimings` narrowed by validation rather than by an
 * `as` cast, exactly as `toPalette` narrows a palette: the column is free-form
 * JSONB written by the voice pipeline (file 36), and a malformed blob must render
 * as an unhighlighted page rather than as a reader that throws mid-story.
 */
function toNarrationTimings(value: Prisma.JsonValue): NarrationTimings | null {
  if (value === null || value === undefined) return null;
  const parsed = NarrationTimingsSchema.safeParse(value);
  if (!parsed.success || parsed.data.spans.length === 0) return null;
  return parsed.data;
}

/**
 * A story's world, in the shape the home screen already receives for a world tile.
 */
function toWorldSummary(
  world: StoryWorld,
  language: Lang,
): StorySummaryResponse["world"] {
  return {
    id: world.id,
    slug: world.slug,
    name:
      pickLocale(
        toLocaleMap(world.translations, (row) => row.name),
        language,
      ).value ?? world.name,
    palette: toPalette(world.palette),
    mascot: world.mascotAsset
      ? {
          id: world.mascotAsset.id,
          url: world.mascotAsset.url,
          kind: world.mascotAsset.kind,
        }
      : null,
  };
}

/** The child-facing title and which locale supplied it. */
function pickTitle(story: StoryRow, language: Lang) {
  const picked = pickLocale(
    toLocaleMap(story.translations, (row) => row.title),
    language,
  );
  return { value: picked.value ?? story.title, locale: picked.locale };
}

function toSummary(
  story: StoryRow & { _count: { pages: number } },
  language: Lang,
  isCompleted: boolean,
): StorySummaryResponse {
  const title = pickTitle(story, language);

  return {
    id: story.id,
    slug: story.slug,
    title: title.value,
    titleAudioUrl: pickLocale(
      toLocaleMap(story.translations, (row) => row.titleAudioAsset?.url),
      language,
    ).value,
    locale: title.locale,
    world: toWorldSummary(story.world, language),
    coverImageUrl: story.coverAsset?.url ?? null,
    pageCount: story._count.pages,
    completed: isCompleted,
  };
}

/**
 * FR-STORY-08 read side — every published story tagged for this child's grade.
 */
export async function listStoriesForChild(
  child: ChildProfile,
): Promise<StorySummaryResponse[]> {
  const [stories, completions] = await Promise.all([
    prisma.story.findMany({
      where: { ...publishedForChild(child), world: publishedRelation },
      orderBy: [{ world: { slug: "asc" } }, { createdAt: "asc" }],
      include: {
        coverAsset: true,
        world: { include: { mascotAsset: true, translations: true } },
        translations: { include: { titleAudioAsset: true } },
        _count: { select: { pages: true } },
      },
    }),
    prisma.rewardLedger.findMany({
      where: { childId: child.id, sourceType: STORY_COMPLETION },
      select: { sourceId: true },
    }),
  ]);

  const finished = new Set(completions.map((row) => row.sourceId));

  return stories.map((story) =>
    toSummary(story, child.preferredLanguage, finished.has(story.id)),
  );
}

/**
 * Resolves a story the child is actually allowed to be reading, or throws 404.
 */
export async function requireVisibleStoryId(
  child: ChildProfile,
  storyId: string,
): Promise<string> {
  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      ...publishedForChild(child),
      world: publishedRelation,
    },
    select: { id: true },
  });
  if (!story) {
    throw ApiError.notFound("Story not found");
  }
  return story.id;
}

/** One story and all of its pages, for the reader (file 26). */
export async function getStoryForChild(
  child: ChildProfile,
  storyId: string,
): Promise<StoryDetailResponse> {
  const language = child.preferredLanguage;

  // The completion read keys off the requested id rather than the fetched row, so
  // it can run alongside the story read instead of after it. A 404 discards it.
  const [story, completion] = await Promise.all([
    prisma.story.findFirst({
      where: {
        id: storyId,
        ...publishedForChild(child),
        world: publishedRelation,
      },
      include: {
        coverAsset: true,
        world: { include: { mascotAsset: true, translations: true } },
        translations: {
          include: { titleAudioAsset: true, moralAudioAsset: true },
        },
        pages: {
          orderBy: { sortOrder: "asc" },
          include: {
            illustrationAsset: true,
            translations: { include: { narrationAudioAsset: true } },
          },
        },
      },
    }),
    prisma.rewardLedger.findFirst({
      where: {
        childId: child.id,
        sourceType: STORY_COMPLETION,
        sourceId: storyId,
      },
      select: { id: true },
    }),
  ]);
  if (!story) {
    throw ApiError.notFound("Story not found");
  }

  const title = pickTitle(story, language);

  return {
    id: story.id,
    slug: story.slug,
    title: title.value,
    // No fall-through to `Story.theme`: that column is the authoring label for the
    // moral, and an admin note is not a sentence to read to a child.
    moral: pickLocale(
      toLocaleMap(story.translations, (row) => row.moral),
      language,
    ).value,
    // Falls back on its own, as the cover's title narration does: a moral
    // translated into Bangla but recorded only in English is still better spoken
    // than silent (FR-STORY-03).
    moralAudioUrl: pickLocale(
      toLocaleMap(story.translations, (row) => row.moralAudioAsset?.url),
      language,
    ).value,
    world: toWorldSummary(story.world, language),
    coverImageUrl: story.coverAsset?.url ?? null,
    locale: title.locale,
    // `sortOrder` is the stored ordering; `pageNumber` is 1-based and contiguous,
    // so a gap left by a deleted page cannot become a page the reader skips.
    pages: story.pages.map((page, index) => {
      // The clip and its timings are picked as one value, not as two independent
      // fallbacks: a span is a character offset into one locale's text, so
      // English spans laid over Bangla narration would highlight nonsense.
      const narration = pickLocale(
        toLocaleMap(page.translations, (row) =>
          row.narrationAudioAsset === null
            ? null
            : {
                url: row.narrationAudioAsset.url,
                timings: toNarrationTimings(row.narrationTimings),
              },
        ),
        language,
      );

      return {
        pageNumber: index + 1,
        illustrationUrl: page.illustrationAsset?.url ?? null,
        text:
          pickLocale(
            toLocaleMap(page.translations, (row) => row.text),
            language,
          ).value ?? "",
        narrationUrl: narration.value?.url ?? null,
        narrationTimings: narration.value?.timings ?? null,
      };
    }),
    completed: completion !== null,
  };
}
