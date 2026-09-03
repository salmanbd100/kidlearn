/**
 * A title reduced to a URL-safe slug.
 *
 * Extracted from `services/ai/generators/lesson.ts` by file 35, when the story
 * generator needed the same rule. Both write a slug into a unique column, and two
 * generators disagreeing about how a title becomes a slug is a difference nobody
 * would notice until an admin searched for one and found the other.
 *
 * ASCII only, and that is a deliberate loss: `normalize("NFKD")` strips the accents
 * it can and the character class drops what remains, so a Bangla title reduces to
 * nothing. Callers pass the English title where they have one and fall back to an
 * admin-typed label otherwise — a transliterated slug would be a URL neither an
 * English nor a Bangla speaker could read.
 *
 * 60 characters because a slug is a handle, not a sentence; the title column keeps
 * the whole thing.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
