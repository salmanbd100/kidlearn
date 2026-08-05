# 36 — AI Audio Narration & Image Generation

> **Estimated effort:** 3–4 hours
> **Depends on:** 33, 34
> **Requirement IDs:** FR-AI-04..06, FR-AI-09, FR-I18N-05
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Complete the media half of the AI pipeline: ElevenLabs text-to-speech producing child-friendly narration per locale (FR-AI-04, FR-I18N-05) with a batch "generate narration" admin action that creates one reviewable audio job per missing locale, Gemini image generation for story/lesson illustrations (FR-AI-05) with `CharacterSheet` reference descriptions guaranteeing recurring characters look the same everywhere (FR-AI-09), the documented partially-manual video flow (FR-AI-06), and per-day job caps so a misclick can't burn the free tiers. All generated assets are uploaded to Cloudinary, registered as `MediaAsset` rows with `aiJobId`, and stay **unattached** to any content until a human approves them in file 37 (FR-CMS-05).

## Context & Current State

File 33 is done: Cloudinary env vars, `services/media.ts` (signing + `registerAsset`), and the `/admin/media` library exist — but only browser-direct uploads; there is no server-side upload path for AI-generated buffers. File 34 is done: `runGenerationJob`, the Claude client, and `aiJobId` columns (including on `MediaAsset`). File 35 added `StoryPage.illustrationPrompt` and stores `characterDescriptions` in story jobs' `rawOutput`. Translation tables carry nullable audio FKs: `LessonTranslation.introAudioAssetId`, `StoryPageTranslation.narrationAudioAssetId`, `QuizQuestionTranslation.audioAssetId` (files 04–05). There is no ElevenLabs or Gemini integration, no `CharacterSheet` model, and no rate guard on any AI endpoint.

## Detailed Requirements

1. **ElevenLabs client (FR-AI-04):** `services/ai/elevenlabs.ts` exporting `generateNarration(text: string, locale: "en" | "bn"): Promise<Buffer>` — POST `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` with `model_id: "eleven_multilingual_v2"`, mp3 output. One configured child-friendly voice per locale via env: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_EN`, `ELEVENLABS_VOICE_ID_BN` (all required; picking the actual voices is an admin task documented in `.env.example` comments).
2. **Server-side media upload:** extend `services/media.ts` with `uploadBuffer(buffer, { folder, resourceType })` using `cloudinary.uploader.upload_stream` (note: Cloudinary stores audio under `resource_type: "video"`), then `registerAsset` creates the `MediaAsset` row (`kind`, `language`, `aiJobId`).
3. **Batch narration action (FR-AI-04, FR-I18N-05, FR-CMS-05):** `POST /api/admin/ai/generate/narration` body `{ entity: "lesson" | "story" | "quiz", id: string }`. The server computes every **missing** `(target, locale)` pair — lesson: `LessonTranslation` rows with `introScript` but null `introAudioAssetId`; story: `StoryPageTranslation` rows with null `narrationAudioAssetId`; quiz: per question per locale where `definition.prompt[locale]` exists but the `QuizQuestionTranslation` audio is missing — and creates **one `AIGenerationJob` (type `audio`) per pair**. Each job: TTS → Cloudinary upload → `MediaAsset` row; `rawOutput` records `{ assetId, url, targetTable, targetId, locale, charCount }`; status `awaiting_review`. **The translation-row FK is NOT set here** — the admin listens first; attachment happens on approval in file 37. Response: `202 { data: { jobIds, skipped } }`.
4. **Gemini image client (FR-AI-05):** `services/ai/gemini.ts` exporting `generateIllustration(prompt: string, characterSheets?: CharacterSheet[]): Promise<Buffer>` — Gemini image model via `@google/genai`; env `GEMINI_API_KEY` (required), `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`). A fixed style prefix enforces the platform look; character sheet descriptions are **prepended to every prompt**.
5. **`CharacterSheet` model (FR-AI-09):** migration adds `model CharacterSheet { id, slug @unique, name, worldId String?, world World? @relation, description String, createdAt, updatedAt }` — one row per world mascot and recurring character; `description` is the stable visual description (colors, size, clothing, distinctive features). Admin CRUD at `POST/GET/PATCH /api/admin/content/character-sheets[/:id]` + a "Characters" tab on `/admin/media`. A story job's `characterDescriptions` (file 35 `rawOutput`) can be promoted into sheets via a one-click "Save as character sheet" action.
6. **Batch illustration action:** `POST /api/admin/ai/generate/illustrations` body `{ storyId }` — one `AIGenerationJob` (type `image`) per `StoryPage` with an `illustrationPrompt` and no `illustrationAssetId`, each prompt prepended with the story world's matching character sheets. Asset registered (`kind: "image"`, `language: null`, `aiJobId`), attachment deferred to approval (file 37).
7. **Video (FR-AI-06, documented — no code):** MVP video is partially manual: the admin generates clips externally (Google Veo / Runway Gen-3) using the lesson's narration script from the job `rawOutput` as the brief, then uploads via the file-33 `/admin/media` upload dialog and attaches as `LessonTranslation.videoAssetId`. Write this flow into a "Video workflow" callout on the media page. Automated video jobs are post-MVP.
8. **Rate/cost guards:** env caps `AI_TEXT_JOBS_PER_DAY` (default 50), `AI_AUDIO_JOBS_PER_DAY` (default 200), `AI_IMAGE_JOBS_PER_DAY` (default 100). A `services/ai/rate-guard.ts` counts `AIGenerationJob` rows of the bucket created since midnight `APP_TIMEZONE`; exceeding returns 429 (`ApiError` with new code `RATE_LIMITED` added to the file-08 `ErrorCode` union). Apply to all `/api/admin/ai/generate/*` endpoints, including 34/35's (batch endpoints check `count(missing pairs)` against remaining budget up front).
9. **Tests (mocked `fetch`/SDKs):** `generateNarration("hello", "bn")` hits the BN voice id; batch narration on a lesson with 2 locales × 1 missing creates exactly the right jobs and `MediaAsset` rows (with `language` set) and sets **no** translation FK; illustration prompt string contains the character sheet description before the page prompt; the cap returns 429 once exceeded; every job carries the audit trail (input, rawOutput refs, status `awaiting_review`).

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/lib/env.ts                        # + ELEVENLABS_*, GEMINI_*, AI_*_JOBS_PER_DAY
apps/server/src/lib/errors.ts                     # + "RATE_LIMITED" code
apps/server/src/services/ai/elevenlabs.ts
apps/server/src/services/ai/gemini.ts
apps/server/src/services/ai/rate-guard.ts
apps/server/src/services/ai/generators/narration.ts
apps/server/src/services/ai/generators/narration.test.ts
apps/server/src/services/ai/generators/illustration.ts
apps/server/src/services/ai/generators/illustration.test.ts
apps/server/src/services/media.ts                 # + uploadBuffer()
apps/server/src/routes/admin/ai.ts                # + narration, illustrations routes + rate guard
apps/server/src/routes/admin/content.ts           # + character-sheets CRUD
packages/db/prisma/migrations/<ts>_character_sheet/
apps/web/app/admin/media/characters-tab.tsx
apps/web/app/admin/media/video-workflow-callout.tsx
apps/web/lib/admin-api.ts                         # extend
```

`elevenlabs.ts` (plain `fetch`, no SDK needed):

```ts
const VOICE_BY_LOCALE = { en: env.ELEVENLABS_VOICE_ID_EN, bn: env.ELEVENLABS_VOICE_ID_BN } as const;

export async function generateNarration(text: string, locale: "en" | "bn"): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_BY_LOCALE[locale]}`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text, model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.6, similarity_boost: 0.8 }, // calm, consistent — kid-friendly
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
```

`gemini.ts` prompt assembly — the FR-AI-09 mechanism:

```ts
const STYLE_PREFIX =
  "Children's book illustration, soft rounded cartoon style, bright cheerful colors, " +
  "thick outlines, no text in image, friendly expressions, suitable for ages 3-6.";

export function buildIllustrationPrompt(prompt: string, sheets: CharacterSheet[]) {
  const characterBlock = sheets.length
    ? `Recurring characters (draw EXACTLY as described, identical in every image):\n${sheets
        .map((s) => `- ${s.name}: ${s.description}`).join("\n")}\n`
    : "";
  return `${STYLE_PREFIX}\n${characterBlock}Scene: ${prompt}`;
}
```

The narration generator reuses `runGenerationJob` with a no-op schema (`z.object({ assetId: z.string(), url: z.string().url() })` over the upload result) so audio jobs share the exact lifecycle, audit shape, and review-queue surface as text jobs. `rate-guard.ts`:

```ts
const BUCKETS = { lesson: "text", story: "text", quiz: "text", audio: "audio", image: "image" } as const;

export async function assertWithinDailyCap(type: AIJobType, pending = 1) {
  const cap = { text: env.AI_TEXT_JOBS_PER_DAY, audio: env.AI_AUDIO_JOBS_PER_DAY, image: env.AI_IMAGE_JOBS_PER_DAY }[BUCKETS[type]];
  const used = await prisma.aIGenerationJob.count({
    where: { type: { in: typesInBucket(BUCKETS[type]) }, createdAt: { gte: startOfTodayInAppTz() } },
  });
  if (used + pending > cap)
    throw new ApiError(429, "RATE_LIMITED", `Daily ${BUCKETS[type]} generation cap (${cap}) reached`, { used, pending, cap });
}
```

`startOfTodayInAppTz()` reuses the file-27 `APP_TIMEZONE` + `date-fns-tz` helpers. Missing-pair queries for the batch endpoint are straightforward Prisma reads; return `skipped` (pairs that already have audio) so the admin UI can say "3 generated, 2 already had audio".

## Step-by-Step Plan

1. Migration: `CharacterSheet` model (+ `World` back-relation); add all new env keys to `lib/env.ts` + `.env.example` (with voice-selection comments); add `RATE_LIMITED` to `ErrorCode`. (~25 min)
2. Write failing tests for `rate-guard` (under cap passes, at cap throws 429, buckets independent, day boundary in `APP_TIMEZONE`); implement. (~25 min)
3. Implement `elevenlabs.ts` + `media.uploadBuffer`; test with mocked `fetch`: BN text → BN voice id in URL, non-OK response throws. (~25 min)
4. Write failing tests for the narration generator: lesson with `en` audio present + `bn` missing creates exactly one `audio` job, one `MediaAsset` (`kind: audio`, `language: bn`, `aiJobId` set), translation FK still null, job `awaiting_review` with target refs in `rawOutput`; implement (jobs via `runGenerationJob`). (~35 min)
5. Implement `gemini.ts` + `buildIllustrationPrompt` (unit test: sheet description precedes scene text; style prefix always first) and the illustration generator over `StoryPage.illustrationPrompt`. (~30 min)
6. Add the three route groups (narration, illustrations, character-sheets CRUD) with rate-guard wiring on **all** `/generate/*` endpoints (incl. retrofitting 34/35 routes); Supertest: 401/403/202/429. (~25 min)
7. Build the `/admin/media` Characters tab (CRUD + "Save as character sheet" from a story job) and the video-workflow callout; add "Generate narration" buttons to the lesson form, story admin, and quiz editor. (~30 min)
8. Manual run: one real narration (each locale) and one real illustration; listen/look via the media library; confirm nothing attached to translations; `pnpm lint && pnpm typecheck && pnpm --filter server test`; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: voice-per-locale routing, missing-pair computation, asset rows written with correct `kind`/`language`/`aiJobId`, illustration prompt composition, 429 at cap, full job audit trail (FR-AI-08).
- [ ] After batch narration, every created asset is reachable from its job's `rawOutput` but **no** `LessonTranslation`/`StoryPageTranslation`/`QuizQuestionTranslation` FK was set — students can not encounter the audio in any query (FR-AI-07 structurally; attachment is file 37's approval).
- [ ] Re-running batch narration on the same lesson creates zero new jobs while audio jobs are pending/approved for those pairs (idempotent missing-pair logic counts in-flight jobs).
- [ ] Each narration `MediaAsset` carries `language` = its locale; illustrations carry `language: null` (FR-I18N-05 per-language storage).
- [ ] Two illustration jobs for pages featuring the same character contain the identical character sheet block in their prompts (FR-AI-09).
- [ ] The `/admin/media` page documents the manual Veo/Runway video flow ending in a file-33 upload + `videoAssetId` attach (FR-AI-06).
- [ ] The 51st text job (default caps) in one `APP_TIMEZONE` day returns 429 `RATE_LIMITED`; the counter resets at local midnight.
- [ ] Server refuses to boot without `ELEVENLABS_API_KEY` or `GEMINI_API_KEY`; `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- The review queue UI, listening/approving audio, attaching approved assets to translation rows, and promoting decisions — file 37.
- Replacing `pending://image` quiz placeholders (file 37's edit flow via the file-33 editor + media picker).
- Automated video generation jobs (post-MVP; FR-AI-06 manual allowance documented here).
- Voice cloning, pronunciation lexicons, or per-character voices (post-MVP).
- Production keys, spend alerts, and provider quota monitoring (file 38).
