/**
 * Placeholder artwork for the starter avatars.
 *
 * The illustrated character sheet comes from the content pipeline (design.md §9)
 * and does not exist yet. Until it does, `GET /api/characters` reports
 * `imageUrl: null` and the picker draws one of these instead: a large glyph on a
 * tinted tile, keyed on the character's `slug`.
 *
 * Three things this file deliberately is not:
 *
 *  - **Not the list of avatars.** The API is the authority on which characters are
 *    selectable and what their ids are — those ids are `Character` rows, and the
 *    set is published content managed from the CMS (file 31). A slug this map has
 *    never heard of still renders, via `FALLBACK_AVATAR_ART`.
 *  - **Not images.** A glyph is text, so there is nothing for `next/image` to
 *    load, nothing to lay out late, and no asset to ship per locale. The moment
 *    `imageUrl` is non-null the picker uses `next/image` and ignores this file.
 *  - **Not a source of names.** The character's name comes from the API and is
 *    wrapped in a localized template for its accessible label.
 *
 * The tints are brand hues, which components may not reference through semantic
 * tokens — decorative character art is the one exception design.md §2.2 grants,
 * and it applies for the same reason it applies to the real illustrations: an
 * avatar is a picture of a lion, not a themed surface.
 */

export type AvatarArt = {
  /** Decorative — the character's name carries the meaning. */
  glyph: string;
  /** Tailwind classes for the tile behind the glyph. */
  tileClassName: string;
};

const AVATAR_ART_BY_SLUG: Record<string, AvatarArt> = {
  "leo-the-lion": { glyph: "🦁", tileClassName: "bg-sunshine/25" },
  "ellie-the-elephant": { glyph: "🐘", tileClassName: "bg-grape/20" },
  "tara-the-turtle": { glyph: "🐢", tileClassName: "bg-mint/25" },
  "bella-the-butterfly": { glyph: "🦋", tileClassName: "bg-coral/20" },
  "dara-the-dolphin": { glyph: "🐬", tileClassName: "bg-sky/20" },
  "ollie-the-owl": { glyph: "🦉", tileClassName: "bg-sunshine/20" },
};

/** For a character published after this map was written. */
export const FALLBACK_AVATAR_ART: AvatarArt = {
  glyph: "⭐",
  tileClassName: "bg-muted",
};

export function avatarArtFor(slug: string): AvatarArt {
  return AVATAR_ART_BY_SLUG[slug] ?? FALLBACK_AVATAR_ART;
}
