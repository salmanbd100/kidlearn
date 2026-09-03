import type { Prisma } from "@kidlearn/db";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { slugify } from "../lib/slug.js";
import { asSlugConflict, isSlugConflict } from "../lib/slug-conflict.js";

/**
 * Character sheets — the prompt text that keeps a recurring character
 * recognisable (file 36, FR-AI-09).
 *
 * **These rows are prompt input, not content.** Nothing here is student-facing:
 * no query in `routes/content.ts` or `routes/stories.ts` reads this table, and a
 * sheet has no `status` column because there is nothing for a child to be
 * protected from. What it does have is reach — editing a description changes every
 * illustration drawn from it afterwards — which is why `updateCharacterSheet`
 * touches `description` and never silently reaches back into pictures already
 * drawn.
 *
 * A separate service from `adminContentService` deliberately: sheets have no
 * publishing workflow, no ordering, no translations and no `updatedBy` audit
 * stamp, so folding them into the four-resource `mount` machinery there would mean
 * teaching it about a resource that opts out of all four of its rules.
 */

export type CharacterSheetDto = {
  id: string;
  slug: string;
  name: string;
  /** `null` for a character used across every world — a narrator, a child. */
  worldId: string | null;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

const sheetSelect = {
  id: true,
  slug: true,
  name: true,
  worldId: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The sheets, world-scoped ones first.
 *
 * `worldId` narrows to *that world plus the world-less ones*, rather than to an
 * exact match, because that is the set the illustration generator applies to a
 * story in that world — a filter that answered differently from the generator
 * would show an admin a character list their pictures do not use.
 */
export function listCharacterSheets(filters: {
  worldId?: string;
}): Promise<CharacterSheetDto[]> {
  return prisma.characterSheet.findMany({
    where: filters.worldId
      ? { OR: [{ worldId: filters.worldId }, { worldId: null }] }
      : {},
    orderBy: [{ worldId: "asc" }, { slug: "asc" }],
    select: sheetSelect,
  });
}

export interface CharacterSheetInput {
  slug?: string;
  name: string;
  worldId?: string | null;
  description: string;
}

export async function createCharacterSheet(
  input: CharacterSheetInput,
): Promise<CharacterSheetDto> {
  await assertWorldExists(input.worldId);

  const slug = input.slug ?? (await uniqueSlug(prisma, input.name));
  await assertSlugFree(slug);

  // `assertSlugFree` answers with the slug in the message, which is the error an
  // admin retyping a name wants; `asSlugConflict` is the same 409 for the race it
  // cannot cover, since the check and the write are two statements.
  return asSlugConflict("character sheet", () =>
    prisma.characterSheet.create({
      data: {
        slug,
        name: input.name.trim(),
        worldId: input.worldId ?? null,
        description: input.description.trim(),
      },
      select: sheetSelect,
    }),
  );
}

/**
 * Edits a sheet. `slug` is not editable.
 *
 * The slug is how a sheet is recognised across an import — `promoteJobCharacters`
 * skips one that already exists by slug — so letting it change would let the same
 * character be imported twice under two names. Renaming is `name`, which is the
 * field the prompt actually prints.
 */
export async function updateCharacterSheet(
  id: string,
  input: Partial<Omit<CharacterSheetInput, "slug">>,
): Promise<CharacterSheetDto> {
  const existing = await prisma.characterSheet.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound("No such character sheet");

  if (input.worldId !== undefined) await assertWorldExists(input.worldId);

  return prisma.characterSheet.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.worldId === undefined ? {} : { worldId: input.worldId }),
      ...(input.description === undefined
        ? {}
        : { description: input.description.trim() }),
    },
    select: sheetSelect,
  });
}

export interface PromotedCharacterSheets {
  created: CharacterSheetDto[];
  /** Characters whose slug already had a sheet; nothing was overwritten. */
  skipped: number;
}

/**
 * Turns a story generation's `characterDescriptions` into sheets — the one-click
 * "Save as character sheet" action (FR-AI-09).
 *
 * Read out of the job's `rawOutput` rather than from a column, because file 35
 * deliberately did not persist them: a story that is later rejected should not
 * leave character records behind. Promoting them is the admin saying this story's
 * cast is worth keeping.
 *
 * **An existing slug is skipped, never overwritten.** The second story set in a
 * world will describe the same mascot again, in slightly different words, and
 * taking the newer description would silently change how that mascot is drawn in
 * every story that already uses it — consistency is the entire point of the table
 * (FR-AI-09). Editing a sheet stays an explicit `PATCH`.
 *
 * The story's world is inherited, so the sheets land scoped the way the
 * illustration generator will look for them.
 */
export async function promoteJobCharacters(
  jobId: string,
): Promise<PromotedCharacterSheets> {
  const job = await prisma.aIGenerationJob.findUnique({
    where: { id: jobId },
    select: { type: true, rawOutput: true },
  });
  if (!job) throw ApiError.notFound("No such generation job");
  if (job.type !== "story") {
    throw ApiError.conflict("Only a story generation describes characters");
  }

  const characters = readCharacterDescriptions(job.rawOutput);
  if (characters.length === 0) {
    throw ApiError.conflict(
      "That job's output holds no character descriptions",
    );
  }

  const worldId = await readJobStoryWorld(job.rawOutput);

  const created: CharacterSheetDto[] = [];
  let skipped = 0;

  for (const character of characters) {
    const slug = slugify(character.name);
    if (slug === "") {
      skipped += 1;
      continue;
    }

    const taken = await prisma.characterSheet.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (taken) {
      skipped += 1;
      continue;
    }

    try {
      created.push(
        await prisma.characterSheet.create({
          data: {
            slug,
            name: character.name.trim(),
            worldId,
            description: character.visualDescription.trim(),
          },
          select: sheetSelect,
        }),
      );
    } catch (error) {
      // A lost race on the unique slug means somebody else saved this character
      // between the check above and this write — which is the same outcome as
      // finding it taken, and this import is idempotent by slug. Anything else is
      // a real failure and belongs to the caller.
      if (!isSlugConflict(error)) throw error;
      skipped += 1;
    }
  }

  return { created, skipped };
}

/**
 * `rawOutput.parsed.characterDescriptions`, defensively.
 *
 * The JSONB column boundary, and read field by field rather than parsed against
 * the story output schema: that schema is built per request from the locales the
 * generation asked for, so reconstructing it here would mean re-deriving a
 * contract in order to read three strings out of it.
 */
function readCharacterDescriptions(
  rawOutput: Prisma.JsonValue,
): Array<{ name: string; visualDescription: string }> {
  const parsed = readObject(readObject(rawOutput)?.parsed);
  const characters = parsed?.characterDescriptions;
  if (!Array.isArray(characters)) return [];

  return characters.flatMap((entry) => {
    const record = readObject(entry);
    const name = record?.name;
    const visualDescription = record?.visualDescription;
    return typeof name === "string" &&
      name.trim() !== "" &&
      typeof visualDescription === "string" &&
      visualDescription.trim() !== ""
      ? [{ name, visualDescription }]
      : [];
  });
}

/** The world of the story the job created, or `null` if it wrote none. */
async function readJobStoryWorld(
  rawOutput: Prisma.JsonValue,
): Promise<string | null> {
  const storyId = readObject(readObject(rawOutput)?.entities)?.storyId;
  if (typeof storyId !== "string") return null;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { worldId: true },
  });
  return story?.worldId ?? null;
}

function readObject(
  value: Prisma.JsonValue | unknown,
): Record<string, unknown> | undefined {
  // The JSONB column boundary: `JsonValue` covers arrays and scalars too, and the
  // two guards are what make the narrowing true rather than asserted.
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function assertWorldExists(worldId: string | null | undefined) {
  if (worldId === null || worldId === undefined) return;

  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { id: true },
  });
  if (!world) throw ApiError.notFound("No such world");
}

async function assertSlugFree(slug: string) {
  const taken = await prisma.characterSheet.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (taken) {
    throw ApiError.conflict(`A character sheet with slug "${slug}" exists`);
  }
}

/** Slugified name, suffixed until free — same walk as `generators/story.ts`. */
async function uniqueSlug(
  client: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const base = slugify(name) || "character";

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const taken = await client.characterSheet.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error(`Could not find a free slug for "${name}"`);
}
