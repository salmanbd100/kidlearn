import type { ChildProfile, MediaAsset, Prisma } from "@kidlearn/db";
import {
  type Locale,
  type NarrationTimings,
  NarrationTimingsSchema,
  pickLocale,
  type StoryDetailResponse,
  type StorySummaryResponse,
  toLocaleMap,
} from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import {
  publishedForChild,
  publishedRelation,
} from "../../shared/utils/published-for-child.js";
import type { GrantSource } from "../rewards/reward.service.js";

// Read here, written by the reward grant; pinned to `GrantSource` so the two
// strings cannot drift into a flag that is silently always `false`.
const STORY_COMPLETION: GrantSource = "story_completion";

type StoryWorld = {
  id: string;
  slug: string;
  name: string;
  palette: Prisma.JsonValue;
  mascotAsset: MediaAsset | null;
  translations?: { language: Locale; name: string }[];
};

type StoryTranslationRow = {
  language: Locale;
  title: string;
  moral: string | null;
  titleAudioAsset?: { url: string } | null;
  moralAudioAsset?: { url: string } | null;
};

// `Story.theme` is deliberately absent: it is the authoring label for the moral and must not be served to a child.
type StoryRow = {
  id: string;
  slug: string;
  title: string;
  coverAsset: { url: string } | null;
  world: StoryWorld;
  translations: StoryTranslationRow[];
};

// Narrowed by conversion, not an `as` cast, because `World.palette` is free-form
// JSONB: a non-string entry is dropped and the card falls back to the theme's
// surface instead of emitting `linear-gradient(undefined, …)`.
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

// Narrowed by validation, not an `as` cast: `narrationTimings` is free-form JSONB
// from the voice pipeline, and a malformed blob must render an unhighlighted
// page, not a reader that throws mid-story.
function toNarrationTimings(value: Prisma.JsonValue): NarrationTimings | null {
  if (value === null || value === undefined) return null;
  const parsed = NarrationTimingsSchema.safeParse(value);
  if (!parsed.success || parsed.data.spans.length === 0) return null;
  return parsed.data;
}

function toWorldSummary(
  world: StoryWorld,
  language: Locale,
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

function pickTitle(story: StoryRow, language: Locale) {
  const picked = pickLocale(
    toLocaleMap(story.translations, (row) => row.title),
    language,
  );
  return { value: picked.value ?? story.title, locale: picked.locale };
}

function toSummary(
  story: StoryRow & { _count: { pages: number } },
  language: Locale,
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

export async function listStoriesForChild(
  child: ChildProfile,
): Promise<StorySummaryResponse[]> {
  const [stories, completions] = await Promise.all([
    prisma.story.findMany({
      where: { ...publishedForChild(child), world: publishedRelation },
      orderBy: [
        { world: { slug: "asc" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
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

export async function getStoryForChild(
  child: ChildProfile,
  storyId: string,
): Promise<StoryDetailResponse> {
  const language = child.preferredLanguage;

  // Keyed off the requested id, not the fetched row, so it runs alongside the story read; a 404 discards it.
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
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
    // No fall-through to `Story.theme`: an admin note is not a sentence to read to a child.
    moral: pickLocale(
      toLocaleMap(story.translations, (row) => row.moral),
      language,
    ).value,
    // Falls back on its own like the cover's title narration: a moral translated
    // but recorded only in English beats silence (FR-STORY-03).
    moralAudioUrl: pickLocale(
      toLocaleMap(story.translations, (row) => row.moralAudioAsset?.url),
      language,
    ).value,
    world: toWorldSummary(story.world, language),
    coverImageUrl: story.coverAsset?.url ?? null,
    locale: title.locale,
    // `sortOrder` is the stored ordering; `pageNumber` is 1-based and contiguous, so a deleted page leaves no gap the reader skips.
    pages: story.pages.map((page, index) => {
      // Clip and timings are picked as one value: spans are character offsets into
      // one locale's text, so English spans over Bangla narration would highlight nonsense.
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
