# Activity and reward feedback placeholders

Every activity answers a child with a sound (FR-ACT-05) — see
`apps/web/components/activities/use-activity-feedback.ts`, which resolves most of
the filenames below. The two reward clips are resolved in
`apps/web/components/lesson/steps/RewardStep.tsx` (FR-LSN-05).

The files here are **one second of silence**, not recordings, exactly as in
`../ui`. Real audio comes from the voice pipeline in implementation file 36;
these exist so a wrong drop is not a 404 on every attempt in the meantime.

Replacing one is a data change: drop in a real clip under the same name.

| File | Played when | What to record |
| --- | --- | --- |
| `cheer-{1,2,3}.mp3` | a correct drop | a short wordless cheer — chime, sparkle, small crowd |
| `retry-{en,bn}-{1,2,3}.mp3` | a wrong drop | warm encouragement: "Try again!", "Nearly!" |
| `oops-{en,bn}.mp3` | an activity that cannot be rendered | "This game is having a nap — let's go on!" |
| `coin-1.mp3` | the coin count-up starts on the reward screen | a short wordless clink or chime — one sound, not a loop |
| `celebration-{en,bn}.mp3` | the mascot's cheer at the end of a lesson | warm spoken praise: "You finished the whole lesson!" |

Three cheers and three encouragements per locale, picked at random per attempt:
a child who hears the same line six times in a row stops hearing it.

**Nothing is spoken in the cheers, or in the coin clink.** They are shared across
locales precisely because they carry no words — only the encouragement, `oops`
and celebration clips are per-locale, and those must be recorded by a native
speaker for `bn`, never machine-translated from the English line.

**One clink, not one per coin.** The audio channel is single-voice by design
(`AudioProvider`), so a sound per coin would only ever interrupt itself.
