# 35 — AI Story & Quiz Generators

> **Estimated effort:** 3–4 hours
> **Depends on:** 34
> **Requirement IDs:** FR-AI-02..03
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Ship the two remaining text generators on top of the file-34 pipeline: the AI Story Generator (FR-AI-02) — admin picks grade levels, a theme/moral, a world, and languages, and gets a complete draft `Story` with ordered `StoryPage` rows, per-locale text, reusable character descriptions (the input for file 36's image consistency), and a per-page illustration prompt — and the AI Quiz Generator (FR-AI-03) — admin picks an existing lesson and gets 3–5 draft `QuizQuestion` rows across the four formats, validated against the exact `packages/types` quiz schemas. Both run through `runGenerationJob`, land as drafts only, and surface in the file-37 review queue.

## Context & Current State

File 34 is done: `services/ai/` has the Claude client (`generateStructured`, tool-use forced JSON), `runGenerationJob` (lifecycle, audit, retry-once), the shared system-prompt persona, the `aiJobId` linkage columns on `Lesson`/`Quiz`/`QuizQuestion`/`Story`/`Activity`/`MediaAsset`, and `/api/admin/ai/generate/lesson`. From file 05, `Story` (slug, title, theme, worldId, gradeLevels, status) → `StoryPage` (sortOrder unique per story) → `StoryPageTranslation` (text + narration ref per locale) exist; `Quiz`/`QuizQuestion` exist with `@@unique([quizId, sortOrder])`. `StoryPage` has **no column for an illustration prompt** — this file adds one. `zod-to-json-schema` is already a dependency. No story or quiz generator code exists.

## Detailed Requirements

1. **Story generator endpoint (FR-AI-02):** `POST /api/admin/ai/generate/story` behind `requireAdmin`, body `{ gradeLevels: ("NURSERY"|"KG1"|"KG2")[], theme: string, worldId: string, languages: ("en"|"bn")[], pageCount?: number (6–8, default 7) }` (`.strict()`). Resolves the world's name/slug for the prompt; responds `202 { data: { jobId } }`.
2. **Story output schema** (`services/ai/schemas/story.ts`): `{ title: per requested locale, moral: string, characterDescriptions: [{ name, kind, visualDescription }] (1–4), pages: [{ pageNumber, text: per locale (1–3 short sentences), illustrationPrompt: string }] }` with refines: `pageNumber` values are exactly `1..pages.length`; every `illustrationPrompt` mentions at least one declared character name (warn-level — implement as a refine that fails, forcing the retry to fix it).
3. **Story persistence:** migration adds `illustrationPrompt String?` to `StoryPage`. Persist creates a draft `Story` (slug from `title.en`, `theme`, `worldId`, `gradeLevels`, `aiJobId`), `StoryPage` rows with `sortOrder = pageNumber` + `illustrationPrompt` (consumed by file 36), and a `StoryPageTranslation` per page per requested locale. `characterDescriptions` stay in the job's `rawOutput` — file 36 promotes them into `CharacterSheet` rows on approval.
4. **Quiz generator endpoint (FR-AI-03):** `POST /api/admin/ai/generate/quiz` body `{ lessonId, count: number (3–5, default 4), languages: ("en"|"bn")[] }`. The prompt is grounded in the lesson: title, grade levels, learning objectives + narration script if the lesson came from a file-34 job (read them from that job's `rawOutput`), otherwise the lesson's intro scripts.
5. **Published-quiz guard (FR-AI-07 structural):** `QuizQuestion` has no own `status` — visibility is the parent `Quiz`'s status. Therefore the endpoint **refuses with 409 `CONFLICT` (code `QUIZ_PUBLISHED`)** when the lesson's quiz is `published` (admin must unpublish first via the file-32 transition); if the lesson has no quiz, a draft `Quiz` is created and wired to the lesson. Generated questions append after the current max `sortOrder`, each with `aiJobId`.
6. **Schema embedding:** the quiz generation tool's `input_schema` embeds the JSON Schema serialized **verbatim from `QuizQuestionSchema`** via `zodToJsonSchema` — the same bytes the renderer and validator use. No hand-written copy of the schema may exist in prompt code (assert via snapshot test). Server-side, every returned question is re-checked with `safeParseQuizQuestion` before insert.
7. **Bangla strategy (documented decision):** both locales are generated in **one structured response** (the schemas above require all requested locales per string). Tradeoff — single call: en/bn stay semantically consistent (same story beats, same answer options), one review item, half the request overhead; per-locale calls: smaller outputs and independent retries, but risk of divergent content and double review burden. **Recommendation: single call for MVP.** Revisit only if combined outputs start hitting `max_tokens` (then: generate `en` first, second call translates with the `en` JSON as grounding).
8. **Tests (mocked client):** valid story fixture persists pages in order with translations per locale; story with gap in `pageNumber`s rejected → retried; invalid quiz format (e.g. 2 options on an mcq) rejected and retried with the Zod issues in the feedback; quiz generation against a published quiz → 409 and **no job row created**.

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/services/ai/schemas/story.ts
apps/server/src/services/ai/schemas/quiz.ts          # thin: count-bounded array of QuizQuestionSchema
apps/server/src/services/ai/prompts/story.ts
apps/server/src/services/ai/prompts/quiz.ts
apps/server/src/services/ai/generators/story.ts
apps/server/src/services/ai/generators/story.test.ts
apps/server/src/services/ai/generators/quiz.ts
apps/server/src/services/ai/generators/quiz.test.ts
apps/server/src/routes/admin/ai.ts                   # + /generate/story, /generate/quiz
apps/server/src/routes/admin/ai.test.ts              # extend
packages/db/prisma/migrations/<ts>_storypage_illustration_prompt/
apps/web/app/admin/stories/generate-story-dialog.tsx # form: grades, theme, world, languages
apps/web/app/admin/curriculum/generate-quiz-button.tsx  # on the lesson form (file 32 UI)
```

**Story user prompt template** (system prompt is the shared file-34 persona; placeholders are admin inputs):

```
Write an illustrated children's story.

Grade levels: {{gradeLevels}}
Theme / moral to teach: {{theme}}
World: {{worldName}} ({{worldSlug}}) — the setting, characters, and atmosphere must belong
to this world (e.g. jungle animals for jungle, sea creatures for ocean).
Languages: {{languages}}
Page count: exactly {{pageCount}} pages.

Produce:
1. title — a short, playful story title, per language.
2. moral — one sentence stating the lesson of the story (English; internal).
3. characterDescriptions — for every character that appears: name, kind (animal/creature),
   and a visualDescription precise enough that an illustrator who has never seen the
   character draws it the same way every time (colors, size, clothing/accessories,
   distinctive features). These descriptions will be reused across many illustrations.
4. pages — for each page: pageNumber (1-based, sequential), text per language (1–3 short
   sentences a 3–6 year old follows when read aloud), and illustrationPrompt (English,
   cartoon style, describing the scene and naming which characters appear, consistent
   with their visualDescription).
The story must end warmly, with the moral demonstrated through the characters' actions —
never stated as a lecture.
```

**Quiz user prompt template:**

```
Generate quiz questions for an existing lesson.

Lesson title: {{lessonTitle}}
Grade levels: {{gradeLevels}}
What the lesson taught:
{{lessonContext}}            ← objectives + narration script, or intro scripts as fallback
Languages: {{languages}}
Question count: {{count}}

Rules:
- Use at least 3 of the 4 formats: mcq, match_pair, drag_answer, picture_select.
- Every question must be answerable purely from what the lesson taught.
- Prompts are spoken aloud: phrase them as a friendly question, per language.
- For picture options, set the option's image url to the literal placeholder
  "pending://image" — illustrations are attached later by an admin.
- Each question must conform exactly to this JSON Schema (also enforced by the tool):

{{QUIZ_QUESTION_JSON_SCHEMA}}
```

`{{QUIZ_QUESTION_JSON_SCHEMA}}` is filled at runtime with `JSON.stringify(zodToJsonSchema(QuizQuestionSchema), null, 2)` — embedding it in the prose *in addition to* the tool schema measurably reduces invalid outputs. Note: `AssetRefSchema.url` is `z.string().url()` — `pending://image` parses as a URL; the file-33 editor (and 37's edit-then-approve) replaces these placeholders with real Cloudinary URLs before the quiz can sensibly be approved; document in the review-queue UI that `pending://` assets block approval (enforced in 37).

`generators/quiz.ts` core guard:

```ts
const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: input.lessonId }, include: { quiz: true } });
if (lesson.quiz?.status === "published")
  throw new ApiError(409, "CONFLICT", "Unpublish the lesson's quiz before generating questions", { code: "QUIZ_PUBLISHED" });
```

`persist` for the story runs in the `runGenerationJob` transaction: `story.create` with nested `pages: { create: [...] }` and nested translations, returning `{ storyId, pageIds }`. For the quiz: `quiz ?? tx.quiz.create({ data: { status: "draft", aiJobId, lessons: { connect: { id } } } })`, then `createMany` questions with `sortOrder` continuing from the existing max.

## Step-by-Step Plan

1. Migration: add `illustrationPrompt String?` to `StoryPage`; `pnpm db:migrate`. (~10 min)
2. Write `StoryGenerationOutputSchema` + valid/invalid fixtures (page-number gap, missing `bn` text, illustrationPrompt naming no character) with unit tests. (~30 min)
3. Implement `prompts/story.ts` + `generators/story.ts`; test with mocked client: pages persisted in order with `sortOrder = pageNumber`, translations per locale, `illustrationPrompt` stored, `Story.aiJobId` set, status `draft`. (~35 min)
4. Write `QuizGenerationOutputSchema` (`z.array(QuizQuestionSchema).min(3).max(5)` + ≥3 distinct formats refine) and the snapshot test pinning `zodToJsonSchema(QuizQuestionSchema)` as the single schema source. (~20 min)
5. Implement `prompts/quiz.ts` (schema embedding) + `generators/quiz.ts` (published-quiz 409, quiz auto-create, sortOrder append); mocked tests including the invalid-format-retried path. (~35 min)
6. Add both routes to `routes/admin/ai.ts` with `.strict()` zod bodies + Supertest (401/403/202, 409 for published quiz with no job row created). (~20 min)
7. Build the two admin UI entry points: generate-story dialog (under `/admin/stories`) and a "Generate questions with AI" button on the file-32 lesson form. (~25 min)
8. Manual run of each generator against the live API; verify drafts in Prisma Studio, student APIs return neither; `pnpm lint && pnpm typecheck && pnpm --filter server test`; update the tracker. (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: story fixture persists N pages in order (1..N) each with translations for every requested locale; pageNumber gap triggers retry; quiz invalid-format triggers retry with Zod issues present in the second call's feedback message.
- [ ] Generated `Story`, `Quiz`, and `QuizQuestion` rows are all `status: draft` (or attached to a draft quiz) with `aiJobId` set; the file-12/25 student APIs return none of them.
- [ ] `POST /api/admin/ai/generate/quiz` against a lesson whose quiz is `published` returns 409 `QUIZ_PUBLISHED` and creates no `AIGenerationJob` row.
- [ ] The snapshot test proves the prompt-embedded JSON Schema is byte-identical to `zodToJsonSchema(QuizQuestionSchema)` from `@kidlearn/types` — no second copy in the codebase.
- [ ] A story generated for `languages: ["en","bn"]` produced both locales in one job (single `AIGenerationJob` row, one review item) — the documented single-call decision.
- [ ] Generated questions read back from Postgres parse with `parseQuizQuestion`.
- [ ] Both endpoints: 401 unauthenticated, 403 parent, 202 admin.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Illustration generation from `StoryPage.illustrationPrompt` and promoting `characterDescriptions` to `CharacterSheet` rows (file 36).
- Narration audio for stories and quiz prompts (file 36).
- Reviewing, editing, approving, rejecting, or publishing any generated content — and replacing `pending://image` placeholders (files 33 editor + 37 queue; 37 blocks approval while placeholders remain).
- Per-day generation caps and cost guards (file 36 introduces them for all job types).
- The story authoring/editing UI beyond the generate dialog (37's edit-then-approve reuses file-33 editors).
