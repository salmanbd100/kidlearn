# Local development media

Placeholder assets for the seeded lesson. **Not committed and not deployed** —
everything in this directory except this README is gitignored, because real
lesson media arrives by admin upload (file 33) and the AI pipeline (file 36), not
from the repository.

`packages/db/prisma/seed.ts` points the "Letter A" lesson at the files below, so
without them the lesson player exercises its missing-asset paths — the friendly
retry on the video step, the silent-but-walkable intro — rather than playing
anything. That is a correct code path, but it is not the one you want to look at
when checking whether the player works.

| File | Used by | What to drop in |
|---|---|---|
| `letter-a.en.mp4` | video step | any short public-domain clip, 1–3 min, H.264/AAC |
| `letter-a.bn.mp4` | video step, `bn` child | a second clip, or a copy of the English one |
| `letter-a.en.jpg` | video poster | any 16:9 still |
| `letter-a-intro.en.mp3` | intro narration | any short spoken clip |

Public-domain sources that work: the Blender Foundation's open movies
(<https://mango.blender.org>, <https://peach.blender.org>) for video, and
Wikimedia Commons for stills and audio. Trim to a minute or two — the point is to
see the player's states, and a long file makes reaching `ended` tedious.

Deliberately *no* Bangla poster or narration is seeded, so a `bn` child on this
lesson exercises the English fallback and the `assetFallbacks` flags the player
reports (FR-I18N-01).
