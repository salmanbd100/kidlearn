// Placeholder artwork for the starter avatars.

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
