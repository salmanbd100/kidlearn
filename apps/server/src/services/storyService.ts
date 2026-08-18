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

/**
 * The Story Library's read side (FR-STORY-01, 04, 05, 08).
 *
 * Same two invariants as `contentService.ts`, for the same reasons: visibility
 * comes from `lib/published-for-child.ts` and nowhere else, and grade and language
 * come from the `ChildProfile` row the caller passes in — never from request input
 * (FR-PROF-03). A story's `World` carries its own `status`, so that edge is gated
 * too: the world supplies the cover's palette and mascot, and a published story
 * hanging off a draft world would theme itself from unreviewed content.
 *
 * ## Completion has no table of its own
 *
 * `completed` is read from `RewardLedger` — the `story_completion` grant file 26
 * writes once per story per child, made idempotent by the ledger's unique index on
 * `(childId, rewardType, sourceType, sourceId)`. A separate `StoryProgress` row
 * would be a second record of the same fact, free to disagree with the one the
 * child's stars were paid from.
 *
 * The lookup is one `findMany` plus a `Set`, not a query per story: a library of
 * twenty covers would otherwise be twenty-one round trips on the first screen a
 * child opens.
 */

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
 *
 * An empty `spans` array collapses to `null` so the client has one "no timings"
 * case to handle instead of two.
 */
function toNarrationTimings(value: Prisma.JsonValue): NarrationTimings | null {
  if (value === null || value === undefined) return null;
  const parsed = NarrationTimingsSchema.safeParse(value);
  if (!parsed.success || parsed.data.spans.length === 0) return null;
  return parsed.data;
}

/**
 * A story's world, in the shape the home screen already receives for a world tile.
 *
 * Deviation from the implementation spec, which described `world` as a
 * `"jungle" | "ocean" | "space"` enum and a `WORLD_ACCENTS` map in the client. The
 * settled schema gives `Story.worldId` a real `World` row carrying `palette` and a
 * mascot, and file 15 already established that a world's look travels in its row
 * (FR-WORLD-05). Sending the row keeps a fourth world a database insert; an enum
 * would make it a change to a union type, a client map, and this file.
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

/**
 * The child-facing title and which locale supplied it.
 *
 * Falls through to `Story.title` — the admin label — only when no translation row
 * exists in either locale. That last step is what keeps a story authored before
 * its translations servable instead of nameless, exactly as `pickName` does for
 * curriculum rows; a missing translation is a content gap to report, never a blank
 * cover.
 */
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
 *
 * Ordered by world and then by creation so the grid is stable between visits: a
 * three-year-old navigates by where a cover *was*, and a list that reshuffles
 * itself is a list they cannot learn.
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
 *
 * Exported so that the completion endpoint (file 26) gates on *this* clause
 * rather than on a copy of it. The two must agree by construction: a story
 * `GET /api/content/stories/:id` will not serve must not be one a child can be
 * paid for finishing, or an unpublished draft becomes a star farm for anyone who
 * can guess a uuid.
 *
 * **404, not 403**, for the reason `getStoryForChild` gives — a 403 would confirm
 * the row exists (NFR-SAFE-02).
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

/**
 * One story and all of its pages, for the reader (file 26).
 *
 * A story that is not published, or not tagged for this child's grade, returns
 * **404, not 403** — a 403 would confirm the row exists, and a draft must be
 * indistinguishable from a story that was never written (spec §7.3.4,
 * NFR-SAFE-02).
 *
 * Text and narration resolve per page and per field rather than per story, so a
 * Bangla story whose narration was only ever recorded in English still reads in
 * Bangla instead of falling back wholesale.
 */
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
