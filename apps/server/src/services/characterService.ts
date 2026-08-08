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
 *
 * The `where` clause is the whole point of this function and matches
 * `assertAvatarIsSelectable` in `childProfileService.ts` exactly — the endpoint
 * must not offer an avatar that `POST /api/children` would then reject:
 *
 *  - `status: "published"` is the content-safety guard (`backend.md §4`). A draft
 *    or in-review character must never become a child's avatar, and must never
 *    appear in a list a parent picks from.
 *  - `isDefault: true` is the unlock rule at MVP: these are the characters
 *    available to everyone from the start. Earned characters carry an
 *    `unlockRule` and are filtered in per child by file 24 — which extends this
 *    query rather than replacing it.
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
