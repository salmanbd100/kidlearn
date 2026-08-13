# Activity feedback placeholders

Every activity answers a child with a sound (FR-ACT-05) — see
`apps/web/components/activities/use-activity-feedback.ts`, which resolves the
filenames below.

The files here are **one second of silence**, not recordings, exactly as in
`../ui`. Real audio comes from the voice pipeline in implementation file 36;
these exist so a wrong drop is not a 404 on every attempt in the meantime.

Replacing one is a data change: drop in a real clip under the same name.

| File | Played when | What to record |
| --- | --- | --- |
| `cheer-{1,2,3}.mp3` | a correct drop | a short wordless cheer — chime, sparkle, small crowd |
| `retry-{en,bn}-{1,2,3}.mp3` | a wrong drop | warm encouragement: "Try again!", "Nearly!" |
| `oops-{en,bn}.mp3` | an activity that cannot be rendered | "This game is having a nap — let's go on!" |

Three cheers and three encouragements per locale, picked at random per attempt:
a child who hears the same line six times in a row stops hearing it.

**Nothing is spoken in the cheers.** They are shared across locales precisely
because they carry no words — only the encouragement clips are per-locale, and
those must be recorded by a native speaker for `bn`, never machine-translated
from the English line.
