-- File 36 — the stable visual description of one recurring character (FR-AI-09).
--
-- An image model draws whatever the prompt says and remembers nothing between
-- calls, so "the rabbit" on page 3 and "the rabbit" on page 7 come back as two
-- different rabbits. This table is the fix: `description` is prepended verbatim to
-- every illustration prompt that features the character, which is the only
-- mechanism that makes a mascot recognisable across a story and across stories.
--
-- `description` is prompt text rather than notes, which is why it is `TEXT NOT
-- NULL` with no default: a sheet with no description would silently contribute
-- nothing to the prompts it was added to, and the drift it was created to stop
-- would look like the feature working.
--
-- `worldId` is nullable with `ON DELETE SET NULL`. A character scoped to a world
-- is how the illustration generator picks the right sheets for a story; a
-- character used everywhere — a narrator, a child protagonist — belongs to none.
-- Deleting a world must not delete the sheets: the prompt text is the asset and it
-- outlives the theme it was written for.
--
-- The index on `worldId` earns its write cost here, unlike the `aiJobId` columns
-- of the previous migration: the illustration generator's per-story read is
-- exactly `WHERE "worldId" = $1 OR "worldId" IS NULL`, and it runs once per batch.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- CreateTable
CREATE TABLE "CharacterSheet" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "worldId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSheet_slug_key" ON "CharacterSheet"("slug");

-- CreateIndex
CREATE INDEX "CharacterSheet_worldId_idx" ON "CharacterSheet"("worldId");

-- AddForeignKey
ALTER TABLE "CharacterSheet" ADD CONSTRAINT "CharacterSheet_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;
