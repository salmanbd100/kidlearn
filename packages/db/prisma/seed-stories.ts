import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type Language, PrismaClient } from "@prisma/client";
import {
  DEV_STORIES,
  type MediaFixture,
  type StoryFixture,
} from "./stories.js";

/**
 * Seeds the development story library (FR-STORY-08).
 *
 * Run on its own with `pnpm --filter @kidlearn/db seed:stories`, and also called
 * by `prisma/seed.ts` so one command leaves a dev database with stories in it.
 *
 * ## Idempotence
 *
 * Everything keys off `Story.slug`, so re-running converges rather than
 * duplicating. Pages are **deleted and recreated inside a transaction** instead of
 * upserted one by one: a page removed from the fixture must disappear from the
 * database, and `@@unique([storyId, sortOrder])` means a renumbered fixture would
 * otherwise collide with the rows it is trying to replace. `StoryPageTranslation`
 * cascades with its page, so the delete takes the old text with it.
 *
 * Story *translations* are upserted rather than replaced, and `update` owns every
 * field — a re-seed is how a fixture correction reaches a database that already
 * has the old text.
 *
 * The 18 remaining starter stories arrive from the AI pipeline (files 35–37) and
 * flow through this same function; nothing here knows or cares where a
 * `StoryFixture` came from.
 */

const LANGUAGES: Language[] = ["en", "bn"];

async function upsertAsset(
  prisma: PrismaClient,
  fixture: MediaFixture,
): Promise<string> {
  const asset = await prisma.mediaAsset.upsert({
    where: { id: fixture.id },
    // The url is owned on update: these are placeholder paths, and moving one
    // must not leave a database pointing at where it used to be.
    update: {
      url: fixture.url,
      kind: fixture.kind,
      language: fixture.language,
    },
    create: {
      id: fixture.id,
      url: fixture.url,
      kind: fixture.kind,
      language: fixture.language,
    },
  });
  return asset.id;
}

async function seedStory(
  prisma: PrismaClient,
  fixture: StoryFixture,
): Promise<void> {
  const world = await prisma.world.findUnique({
    where: { slug: fixture.worldSlug },
    select: { id: true },
  });
  if (!world) {
    throw new Error(
      `No world with slug "${fixture.worldSlug}" — run \`pnpm db:seed\` first, ` +
        "which creates the worlds these stories are set in.",
    );
  }

  const coverAssetId = fixture.cover
    ? await upsertAsset(prisma, fixture.cover)
    : null;

  const story = await prisma.story.upsert({
    where: { slug: fixture.slug },
    update: {
      title: fixture.title,
      theme: fixture.theme,
      worldId: world.id,
      gradeLevels: fixture.gradeLevels,
      coverAssetId,
      // Published on purpose: these two are what makes the library screen
      // walkable in development. Real content is never auto-published — it
      // passes human review first (spec §7.3.4), which is why the AI pipeline
      // writes `draft` and an admin promotes it.
      status: "published",
    },
    create: {
      slug: fixture.slug,
      title: fixture.title,
      theme: fixture.theme,
      worldId: world.id,
      gradeLevels: fixture.gradeLevels,
      coverAssetId,
      status: "published",
    },
  });

  for (const language of LANGUAGES) {
    const translation = fixture.translations[language];
    if (translation === undefined) continue;

    const titleAudioAssetId = translation.titleAudio
      ? await upsertAsset(prisma, translation.titleAudio)
      : null;
    const data = {
      title: translation.title,
      moral: translation.moral ?? null,
      titleAudioAssetId,
    };

    await prisma.storyTranslation.upsert({
      where: { storyId_language: { storyId: story.id, language } },
      update: data,
      create: { storyId: story.id, language, ...data },
    });
  }

  // Narration and illustration assets are written outside the transaction: they
  // are shared rows keyed by fixed ids, and holding a transaction open across
  // them would serialise every page's asset write for no benefit.
  const pages = await Promise.all(
    fixture.pages.map(async (page) => ({
      sortOrder: page.sortOrder,
      illustrationAssetId: page.illustration
        ? await upsertAsset(prisma, page.illustration)
        : null,
      translations: await Promise.all(
        LANGUAGES.map(async (language) => {
          const narration = page.narration?.[language];
          return {
            language,
            text: page.text[language],
            narrationAudioAssetId: narration
              ? await upsertAsset(prisma, narration)
              : null,
          };
        }),
      ),
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.storyPage.deleteMany({ where: { storyId: story.id } });
    for (const page of pages) {
      await tx.storyPage.create({
        data: {
          storyId: story.id,
          sortOrder: page.sortOrder,
          illustrationAssetId: page.illustrationAssetId,
          translations: { create: page.translations },
        },
      });
    }
  });
}

export async function seedStories(
  prisma: PrismaClient,
  stories: StoryFixture[] = DEV_STORIES,
): Promise<void> {
  for (const fixture of stories) {
    await seedStory(prisma, fixture);
  }
  console.log(`Seeded ${stories.length} stories.`);
}

/**
 * Standalone entry point, so `seed:stories` runs it and `seed.ts` importing
 * `seedStories` does not. `realpathSync` because pnpm and tsx both resolve the
 * script through symlinks, which would otherwise never match `import.meta.url`.
 */
const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isDirectRun) {
  const prisma = new PrismaClient();
  seedStories(prisma)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
