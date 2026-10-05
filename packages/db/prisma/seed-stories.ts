import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type Language, PrismaClient } from "@prisma/client";
import {
  DEV_STORIES,
  type MediaFixture,
  type StoryFixture,
} from "./stories.js";

const LANGUAGES: Language[] = ["en", "bn"];

async function upsertAsset(
  prisma: PrismaClient,
  fixture: MediaFixture,
): Promise<string> {
  const asset = await prisma.mediaAsset.upsert({
    where: { id: fixture.id },
    // The url is owned on update: moving a placeholder path must not leave a database pointing at the old one.
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
      // Published on purpose to make the library walkable in dev; real content is never auto-published (human review first).
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
    const moralAudioAssetId = translation.moralAudio
      ? await upsertAsset(prisma, translation.moralAudio)
      : null;
    const data = {
      title: translation.title,
      moral: translation.moral ?? null,
      titleAudioAssetId,
      moralAudioAssetId,
    };

    await prisma.storyTranslation.upsert({
      where: { storyId_language: { storyId: story.id, language } },
      update: data,
      create: { storyId: story.id, language, ...data },
    });
  }

  // Outside the transaction: shared rows on fixed ids, and holding it open would serialise every page's asset write.
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

/** `realpathSync` because pnpm and tsx resolve the script through symlinks, which would never match `import.meta.url`. */
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
