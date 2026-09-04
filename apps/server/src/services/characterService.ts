/**
 * Selectable avatar characters (FR-PROF-02). No Express types cross this
 * boundary — every function here is callable from a test without an HTTP layer.
 */
import { prisma } from "../lib/prisma.js";

/** One avatar the profile form may offer. */
export type AvatarCharacter = {
  id: string;
  slug: string;
  name: string;
  /** `null` until the illustrated character sheet lands (design.md §9). */
  imageUrl: string | null;
};

/**
 * The starter avatars, alphabetically by name so the picker's order is stable.
 */
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
