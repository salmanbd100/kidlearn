# Local development media

Placeholder assets for the seeded lessons and stories. **Not committed and not
deployed** — everything in this directory except this README is gitignored,
because real media arrives by admin upload (file 33) and the AI pipeline
(file 36), not from the repository.

## Regenerating

```bash
brew install lame                      # once — the only thing not already on macOS
bash apps/web/scripts/generate-dev-media.sh
```

The script writes every file the seed references, so `pnpm --filter @kidlearn/db
db:seed` followed by the command above leaves no broken url anywhere in the
student journey. It needs macOS (`say` for speech, `qlmanage` + `sips` for
rasterising SVG) and `lame` to encode the narration as real `.mp3`.

Without these files the players exercise their missing-asset paths — the
friendly retry on the video step, the silent-but-walkable intro, a story page
with no voice. Those are correct code paths, but they are not the ones you want
to look at when checking whether the player works.

Every url here is a relative path on purpose. A remote origin would have to be
listed in `MEDIA_ASSET_HOSTS` before `next/image` would load it, and an
unconfigured host is a **thrown error**, not a broken image.

## What the script produces

| File | Used by |
|---|---|
| `mascot-jungle-monkey.png` | Jungle world card (home screen) |
| `mascot-ocean-dolphin.png` | Ocean world card |
| `letter-a.{en,bn}.mp4` | every lesson's video step — one clip, reused |
| `letter-a.en.jpg` | `letter-a-sounds` / `letter-a-practice` poster |
| `{trace-letter-a,meet-the-dolphin,count-the-fish}.en.jpg` | the other posters |
| `letter-a-intro.en.mp3` | `letter-a-sounds` intro narration |
| `{trace-letter-a,meet-the-dolphin,count-the-fish}-intro.{en,bn}.mp3` | intro narration |
| `story-sharing-monkey.png` | story cover in the library grid |
| `story-sharing-monkey.p{1..5}.png` | its five page illustrations |
| `story-sharing-monkey.title.{en,bn}.mp3` | cover tapped once — title read aloud |
| `story-sharing-monkey.{1..5}.{en,bn}.mp3` | page narration, every page, both locales |
| `story-sharing-monkey.moral.{en,bn}.mp3` | the finish screen's moral |
| `story-dot-counts-the-fish.png` | second story cover |
| `story-dot-counts-the-fish.p{1..5}.png` | its five page illustrations |
| `story-dot-counts-the-fish.{title,1,moral}.en.mp3` | English only — see below |

The video is the one asset the script does not generate: `letter-a.en.mp4` and
`letter-a.bn.mp4` are a hand-dropped clip (H.264/AAC, 960×540, ~5s) that every
lesson reuses. To replace it, drop in any short public-domain clip — the Blender
Foundation's open movies (<https://mango.blender.org>, <https://peach.blender.org>)
work well. Trim to a minute or two: the point is to see the player's states, and
a long file makes reaching `ended` tedious.

## The gaps are deliberate

Two fallbacks are worth keeping exercised, so the script does **not** fill them:

- **No Bangla narration or poster on `letter-a-sounds`.** A `bn` child there gets
  the English still and the English voice — the two `assetFallbacks` flags the
  player reports (FR-I18N-01).
- **`dot-counts-the-fish` has narration on page 1 only**, no Bangla title audio
  and no Bangla moral. A `bn` child reads Bangla text while hearing the English
  recording (FR-STORY-05), and pages 2–5 are silent — the state the reader has to
  work without.

## What the script cannot fix

Activity and quiz images live *inside* the JSONB payload, where
`ImageAssetRefSchema` requires an `https://` url — a relative `/dev/` path does
not parse. Those point at `placehold.co`, allowed by default outside production
in `apps/web/next.config.ts`. Payload **audio** (an activity's `instructionAudio`,
a question's `promptAudio`) has the same constraint and no free public host, so
it stays on the unresolvable `cdn.kidlearn.test` and is silent until a real CDN
is configured. Every other voice in the journey is local and works.
