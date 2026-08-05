# 33 — Admin Media Upload & Content Editors

> **Estimated effort:** 3–4 hours
> **Depends on:** 32
> **Requirement IDs:** FR-CMS-02..04, FR-GAM-04 (admin manage)
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Give admins the content-production tools the curriculum shell from file 32 is missing: Cloudinary media upload via server-issued signatures and a registered `MediaAsset` row per upload (FR-CMS-02), a filterable media library at `/admin/media`, guided editors that build schema-valid JSONB payloads for quiz questions (FR-CMS-03) and activity definitions with live Zod validation and real-renderer preview, a badge manager (FR-GAM-04), and an end-to-end lesson preview that runs the REAL student lesson player against unpublished content — for admins only (FR-CMS-04).

## Context & Current State

File 32 is done: `/api/admin/content/*` CRUD for worlds/subjects/topics/lessons behind `requireAdmin`, the `assertTransition` status service, and the `/admin/curriculum` tree UI exist. Because files run in serial order, the student-side engines are also done: lesson player (16), activity renderers (18–20), and quiz renderers (21–22) — this file reuses them for previews. `packages/types` (file 07) exports `ActivityDefinitionSchema`, `QuizQuestionSchema`, `safeParseActivityDefinition`, `safeParseQuizQuestion`, and valid fixtures. Prisma has `MediaAsset` (url, kind `video|audio|image`, `language Language?`, explicit FKs from owning entities — files 04–05), `Activity`/`Quiz`/`QuizQuestion` with JSONB `definition` (05), and `Badge` with `ruleType` + `rule Json` (06). There is no Cloudinary integration, no media routes, no quiz/activity/badge editor, and the file-12 student API has no preview bypass.

## Detailed Requirements

1. **Signed upload (FR-CMS-02):** `POST /api/admin/media/sign` (behind `requireAdmin`) returns `{ timestamp, folder, signature, apiKey, cloudName }` computed with `CLOUDINARY_API_SECRET`. The browser then uploads the file **directly to Cloudinary** (`https://api.cloudinary.com/v1_1/<cloudName>/auto/upload`) — the file never transits our server. New env vars `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` added to `lib/env.ts` + `.env.example`.
2. **Asset registration:** after Cloudinary responds, the client calls `POST /api/admin/media` with `{ url, kind, language? }`; the server verifies the URL is a `https://res.cloudinary.com/<cloudName>/…` delivery URL and creates the `MediaAsset` row. `GET /api/admin/media?kind=&language=` lists assets newest-first.
3. **Media library UI:** `/admin/media` — grid of assets with kind/language filter chips, inline `<audio>`/`<video>`/image preview, copy-URL button, and an "Attach…" action that PATCHes the owning entity's FK through the existing file-32 admin endpoints (e.g. set a lesson translation's `videoAssetId`, a world's `mascotAssetId`, a badge's `iconAssetId`).
4. **Quiz question editor (FR-CMS-03):** `/admin/curriculum/quiz/[quizId]` manages a quiz's ordered questions. One guided form per format (`mcq`, `match_pair`, `drag_answer`, `picture_select`): format select → format-specific fields (per-locale prompt en/bn, options with media pickers, correct answer select). The form state compiles to a JSON payload that is `safeParseQuizQuestion`-validated **live on every change** (issues shown inline) and rendered in a live preview using the real file-21/22 quiz components. New endpoints: `POST/GET /api/admin/content/quizzes`, `POST /api/admin/content/quizzes/:quizId/questions`, `PATCH/DELETE /api/admin/content/quizzes/:quizId/questions/:id` — the server re-validates `definition` with the same shared schema and rejects with 400 `VALIDATION_FAILED` if it does not parse or `definition.type !== format`.
5. **Activity definition editor:** same pattern at `/admin/curriculum/activity/[activityId]` for the four activity types (`drag_drop`, `trace`, `match`, `puzzle`): type select → format-specific fields, live `safeParseActivityDefinition` validation, preview via the file-18/19/20 renderers. Endpoints `POST/GET/PATCH /api/admin/content/activities[/:id]`.
6. **Badge manager (FR-GAM-04):** `/admin/badges` — CRUD over `Badge` rows via `POST/GET/PATCH /api/admin/content/badges[/:id]`. The rule JSONB is built by a guided form: `ruleType` select (`lessons_completed_in_topic` | `stories_completed` | `streak_days` | `animals_identified`) drives which parameter fields render (e.g. `topicSlug` + `count`); free-form JSON editing is deliberately not offered. Badges ride the same `ContentStatus` transitions via the file-32 `/transition` pattern.
7. **Lesson preview (FR-CMS-04):** the file-12 endpoint `GET /api/content/lessons/:id` accepts `?preview=1`. When present **and the session belongs to an admin** (server-side check — never trust the query param alone), the `status = published` filter is skipped; otherwise 404 as today. The admin curriculum UI gets a "Preview" button opening `/lesson/[id]?preview=1` — the real student player with a visible "PREVIEW" banner, and all progress/SessionEvent writes suppressed in preview mode.
8. **Tests:** signature endpoint auth (401/403 for non-admins, deterministic signature for fixed timestamp), asset registration URL validation, editor payloads round-tripping through the shared schemas (invalid definition → 400), preview bypass admin-only.

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/lib/env.ts                          # + CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET
apps/server/src/services/media.ts                   # signUploadParams() + registerAsset()
apps/server/src/routes/admin/media.ts               # /sign + register + list
apps/server/src/routes/admin/media.test.ts
apps/server/src/routes/admin/content.ts             # + quizzes/questions, activities, badges routers
apps/server/src/routes/admin/content-editors.test.ts
apps/server/src/lib/schemas/admin-media.ts          # zod request schemas
apps/server/src/routes/content.ts                   # file-12 lessons route: preview bypass
apps/web/app/admin/media/page.tsx                   # library grid + filters
apps/web/app/admin/media/upload-dialog.tsx          # sign → direct upload → register
apps/web/app/admin/curriculum/quiz/[quizId]/page.tsx
apps/web/app/admin/curriculum/activity/[activityId]/page.tsx
apps/web/app/admin/badges/page.tsx
apps/web/components/admin/quiz-question-editor.tsx  # per-format forms + live validation + preview
apps/web/components/admin/activity-editor.tsx
apps/web/components/admin/media-picker.tsx          # reusable asset chooser (filters by kind)
apps/web/components/lesson/lesson-player.tsx        # preview mode: banner + no progress writes
apps/web/lib/admin-api.ts                           # extend with media/editor calls
```

Add `cloudinary` (^2) to `apps/server` dependencies. `services/media.ts`:

```ts
import { v2 as cloudinary } from "cloudinary";
import { env } from "../lib/env";

export function signUploadParams(folder: string) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
  return { ...params, signature, apiKey: env.CLOUDINARY_API_KEY, cloudName: env.CLOUDINARY_CLOUD_NAME };
}
```

Request schemas in `admin-media.ts`:

```ts
export const SignUploadSchema = z.object({
  kind: z.enum(["video", "audio", "image"]), // → folder kidlearn/{kind}
}).strict();

export const RegisterAssetSchema = z.object({
  url: z.string().url(),
  kind: z.enum(["video", "audio", "image"]),
  language: z.enum(["en", "bn"]).nullable().default(null),
}).strict().refine(
  (v) => v.url.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`),
  { message: "url must be a Cloudinary delivery URL for this cloud" },
);
```

Question create handler — shared schema is the gate, format must match payload:

```ts
router.post("/quizzes/:quizId/questions", validate({ body: QuestionUpsertSchema }), async (req, res) => {
  const parsed = safeParseQuizQuestion(req.body.definition);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "definition fails shared quiz schema", parsed.error.flatten());
  if (parsed.data.type !== req.body.format) throw new ApiError(400, "VALIDATION_FAILED", "format/definition.type mismatch");
  const sortOrder = (await prisma.quizQuestion.count({ where: { quizId: req.params.quizId } })) + 1;
  const q = await prisma.quizQuestion.create({ data: { quizId: req.params.quizId, format: req.body.format, definition: parsed.data, sortOrder } });
  res.status(201).json({ data: q });
});
```

Preview bypass in the file-12 lessons route (admin check server-side, derived from the session — the query param only requests the mode):

```ts
const isAdminPreview = req.query.preview === "1" && (await isAdminSession(req));
const lesson = await prisma.lesson.findFirst({
  where: { id: req.params.id, ...(isAdminPreview ? {} : { status: "published" }) },
  include: { translations: true, world: true },
});
```

Editor UI: `quiz-question-editor.tsx` keeps form state per format, compiles `definition` with `useMemo`, runs `safeParseQuizQuestion(definition)` on every change, renders flattened issues under the offending fields, and mounts the real quiz step renderer (file 21/22) in a phone-sized preview pane fed the parsed value when valid. `media-picker.tsx` reuses `GET /api/admin/media?kind=audio&language=en` so promptAudio refs are picked, not typed. Badge form mirrors this: `ruleType` select switches a small param fieldset; the API stores `{ ruleType, rule }` exactly as the file-24 engine consumes them.

## Step-by-Step Plan

1. Add the three Cloudinary keys to `lib/env.ts` + `.env.example`; write failing tests for `POST /api/admin/media/sign` (401 unauthenticated, 403 parent, 200 admin with signature reproducible from a fixed timestamp) and implement `services/media.ts` + the route. (~25 min)
2. Tests + implementation for `POST /api/admin/media` (Cloudinary-URL refine rejects foreign hosts) and `GET /api/admin/media` with kind/language filters. (~20 min)
3. Add quiz container + question routes; tests prove an invalid `definition` (use the invalid fixtures from `@kidlearn/types`) returns 400 with flattened issues, a valid fixture persists, and `format` mismatch is rejected. (~30 min)
4. Add activity + badge routes with the same shared-schema gate (badges: `ruleType`-driven param zod schema); tests. (~25 min)
5. Add the preview bypass to the file-12 lessons route; Supertest: draft lesson 404s normally, 200 with `?preview=1` + admin session, still 404 with `?preview=1` + parent session. (~20 min)
6. Build `/admin/media` (upload dialog: sign → XHR to Cloudinary with progress → register; grid with filters, copy URL, attach) and `media-picker.tsx`. (~35 min)
7. Build the quiz question editor and activity editor pages with live validation + real-renderer preview; build `/admin/badges`. (~40 min)
8. Wire the "Preview" button in `/admin/curriculum`, add the preview banner + write-suppression to the lesson player; manual pass (upload an image, author one MCQ, preview a draft lesson end-to-end); `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update the tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: sign endpoint 401/403/200, register URL validation, question/activity/badge CRUD, shared-schema 400s, preview bypass matrix (admin+param ✅, param-only ❌, admin-only ❌).
- [ ] `pnpm --filter web test` passes: editor compiles a valid MCQ payload that `safeParseQuizQuestion` accepts; removing the `bn` prompt surfaces an inline validation error and disables Save.
- [ ] Uploading a file in `/admin/media` performs zero file bytes through `apps/server` (verify network tab: only `/sign` and `/media` JSON calls hit our API).
- [ ] A `MediaAsset` row exists for every completed upload with correct `kind` and `language` (null allowed for images).
- [ ] A question saved through the editor parses with `parseQuizQuestion` when read back raw from Postgres.
- [ ] `GET /api/content/lessons/:id` for a draft lesson returns 404 to students and parents even with `?preview=1`; returns the lesson to an admin with `?preview=1`; in preview the player writes no `LessonProgress` or `SessionEvent` rows.
- [ ] Badge rows created via the guided form contain only the params the selected `ruleType` allows (server rejects extras — `.strict()`).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Server-side uploads of AI-generated buffers to Cloudinary (file 36 extends `services/media.ts` for that).
- AI generation of any content and the `aiJobId` linkage columns (files 34–36).
- The AI review queue and its edit-then-approve hook into these editors (file 37 adds the `?jobId=` pre-fill flow).
- Story authoring UI beyond what 32 delivered (AI story generation lands in 35; review/edit in 37).
- Production Cloudinary credentials, upload presets hardening, and quota monitoring (file 38).
