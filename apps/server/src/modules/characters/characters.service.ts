import { prisma } from "../../config/prisma.js";

export type AvatarCharacter = {
  id: string;
  slug: string;
  name: string;
  /** `null` until the illustrated character sheet lands (design.md §9). */
  imageUrl: string | null;
};

/** Alphabetical by name so the picker's order is stable. */
export async function listStarterAvatars(): Promise<AvatarCharacter[]> {
  const characters = await prisma.character.findMany({
    where: { isDefault: true, status: "published" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      asset: { select: { url: true } },
    },
  });

  return characters.map(({ id, slug, name, asset }) => ({
    id,
    slug,
    name,
    imageUrl: asset?.url ?? null,
  }));
}
