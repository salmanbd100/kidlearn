# 34 — AI Pipeline Foundation & Lesson Generator

> **Estimated effort:** 3–4 hours
> **Depends on:** 07, 31
> **Requirement IDs:** FR-AI-01, FR-AI-08
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the reusable AI generation pipeline in `apps/server/src/services/ai/` — a Claude API client and a `runGenerationJob` service that owns the `AIGenerationJob` lifecycle (`pending → generating → awaiting_review | failed`), persists the verbatim model output plus token usage for audit (FR-AI-08), validates output against shared Zod schemas with one error-fed retry — and ship its first consumer: the AI Lesson Generator (FR-AI-01), where an admin picks grade, subject, topic, and languages and receives a complete draft lesson (objectives, intro script, narration script, schema-valid quiz questions) that can only ever reach students through the file-37 review queue.

## Context & Current State

File 31 gave us `requireAdmin` and the `/admin` shell (the sidebar already has an "AI Queue" slot — its page comes in 37). File 07 gave `packages/types`: `QuizQuestionSchema`, `safeParseQuizQuestion`, and valid fixtures. From file 06, the `AIGenerationJob` model exists with `type` (`lesson|story|quiz|audio|image`), `input Json`, `rawOutput Json?`, `status` (`pending|generating|awaiting_review|approved|rejected|failed`), `reviewerId`, `decision` (`approve|edit_then_approve|reject`), and timestamps. Files 04–05 provide `Lesson`/`LessonTranslation`/`Quiz`/`QuizQuestion` (all `status ContentStatus @default(draft)`). There is no AI code, no Anthropic dependency, and no link between content rows and the jobs that generated them. The structural FR-AI-07 guarantee starts here: generators only ever create **draft** rows; nothing in this file (or 35/36) can publish.

## Detailed Requirements

1. **Claude client:** `services/ai/claude.ts` wraps `@anthropic-ai/sdk`. Env: `ANTHROPIC_API_KEY` (required), `ANTHROPIC_MODEL` (default `claude-sonnet-4-5` — the latest Sonnet-class model per Shared Technical Decisions). All calls use **tool use with `tool_choice: { type: "tool", name: … }`** so the model must return JSON matching the tool's `input_schema` — no free-text parsing.
2. **`runGenerationJob` (FR-AI-08):** generic orchestrator. Creates the job row (`pending`, `input` = admin params + prompt metadata), flips to `generating`, calls the provided `generate` function, validates the raw output with the provided Zod schema; on validation failure it retries **once** with the flattened Zod issues appended to the conversation, then marks the job `failed` (raw outputs of both attempts kept). On success it runs the provided `persist` callback inside a transaction (creating draft entities), stores `rawOutput = { attempts: [...], usage, parsed, entities }`, and sets `awaiting_review`. Provider/network errors → `failed` with the error message in `rawOutput`.
3. **AI-origin linkage (feeds FR-AI-07 in file 37):** one migration adds `aiJobId String?` (+ relation to `AIGenerationJob`) to `Lesson`, `Quiz`, `QuizQuestion`, `Story`, `Activity`, and `MediaAsset`. Every entity a generator creates carries the creating job's id. File 37 extends `assertTransition` so rows with `aiJobId` cannot publish without an approved job — this file only adds the columns and sets them.
4. **Lesson generator endpoint (FR-AI-01):** `POST /api/admin/ai/generate/lesson` behind `requireAdmin`, body `{ gradeLevel: "NURSERY"|"KG1"|"KG2", subjectId, topicId, lessonFocus: string, languages: ("en"|"bn")[] }` (zod, `.strict()`). Resolves subject/topic names, builds the prompt, runs the job, responds `202` with `{ data: { jobId } }` (generation is awaited inline at MVP — no queue infra; document that a background queue is the post-MVP path).
5. **Output schema:** `LessonGenerationOutputSchema` in `services/ai/schemas/lesson.ts` — `{ learningObjectives: string[] (2–4), introScript: per requested locale, narrationScript: per requested locale, quizQuestions: QuizQuestionSchema[] (3–5) }`. The quiz questions reuse `QuizQuestionSchema` from `@kidlearn/types` **unchanged** — one schema for renderer, validator, and prompt.
6. **Persistence:** a draft `Lesson` (under the chosen topic, world inherited from topic's existing lessons or chosen by admin — add optional `worldId` to the request), `LessonTranslation` per requested locale (`introScript`), a draft `Quiz` + `QuizQuestion` rows (`sortOrder` 1..n), `lesson.quizId` wired, **everything `status: draft` and `aiJobId` set**. The narration script is stored in `input`/`rawOutput` for file 36's TTS to consume (no schema column needed yet).
7. **Prompt safety:** the system prompt (full text below) mandates age-appropriate, culturally neutral content with no violence, fear, or scary imagery, and native-quality text per locale.
8. **Tests (mocked Anthropic client):** fixture output validates and persists drafts; invalid-then-valid responses exercise the retry path (job ends `awaiting_review`, both attempts stored); twice-invalid → `failed`; status transition order asserted; token usage recorded.

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/lib/env.ts                       # + ANTHROPIC_API_KEY, ANTHROPIC_MODEL
apps/server/src/services/ai/claude.ts            # client + generateStructured() helper
apps/server/src/services/ai/run-generation-job.ts
apps/server/src/services/ai/run-generation-job.test.ts
apps/server/src/services/ai/schemas/lesson.ts    # LessonGenerationOutputSchema
apps/server/src/services/ai/prompts/lesson.ts    # SYSTEM_PROMPT + buildLessonUserPrompt()
apps/server/src/services/ai/generators/lesson.ts # generateLesson(): prompt → persist drafts
apps/server/src/services/ai/generators/lesson.test.ts
apps/server/src/routes/admin/ai.ts               # POST /api/admin/ai/generate/lesson
apps/server/src/routes/admin/ai.test.ts
packages/db/prisma/migrations/<ts>_ai_job_linkage/  # aiJobId on 6 content models
apps/web/app/admin/curriculum/generate-lesson-dialog.tsx  # admin form
```

Deps: `@anthropic-ai/sdk`, `zod-to-json-schema` (serializes the shared Zod schemas into the tool's `input_schema` — single source of truth, FR-AI-03 groundwork).

`claude.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function generateStructured(opts: {
  system: string; messages: Anthropic.MessageParam[];
  toolName: string; outputSchema: z.ZodTypeAny;
}) {
  const res = await client.messages.create({
    model: env.ANTHROPIC_MODEL, max_tokens: 8192,
    system: opts.system, messages: opts.messages,
    tools: [{ name: opts.toolName, description: "Return the generated content.",
              input_schema: zodToJsonSchema(opts.outputSchema) as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: opts.toolName },
  });
  const tool = res.content.find((b) => b.type === "tool_use");
  return { raw: tool?.input ?? null,
           usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
}
```

`run-generation-job.ts` contract:

```ts
export async function runGenerationJob<T>(opts: {
  type: AIJobType;
  input: Prisma.JsonObject;                       // audit: everything the admin sent
  generate: (retryFeedback?: string) => Promise<{ raw: unknown; usage: TokenUsage }>;
  schema: z.ZodType<T>;
  persist: (parsed: T, jobId: string, tx: Prisma.TransactionClient) => Promise<Prisma.JsonObject>; // returns entity ids
}): Promise<{ jobId: string; status: "awaiting_review" | "failed" }>
```

Retry feedback message (verbatim): `"Your previous response failed schema validation. Errors:\n{{flattenedZodIssues}}\nCall the tool again with corrected JSON. Keep every field that was already valid unchanged."`

**System prompt** (`prompts/lesson.ts`, exact text — shared persona reused by file 35):

```
You are a curriculum writer for KidLearn, an educational platform for children aged 3 to 6
(grades: Nursery, KG-1, KG-2). You write warm, simple, encouraging content designed to be
READ ALOUD to a child who cannot yet read.

Hard rules:
- Age-appropriate: short sentences, concrete everyday words, playful and gentle tone.
- Culturally neutral: no religious references, no country-specific idioms, no brand names,
  no holidays tied to one culture.
- Safe: absolutely no violence, fear, scary imagery, danger, injury, or negative pressure.
  Mistakes are always okay and met with encouragement.
- Multilingual: every child-facing string must be provided in EVERY requested language with
  natural, native-quality phrasing — never a literal word-for-word translation.
- Output ONLY by calling the provided tool with JSON conforming exactly to its schema.
```

**User prompt template** (placeholders are the admin's inputs):

```
Generate a complete lesson plan.

Grade level: {{gradeLevel}}
Subject: {{subjectName}}
Topic: {{topicName}}
Lesson focus: {{lessonFocus}}
Languages: {{languages}}

Produce:
1. learningObjectives — 2 to 4 short objectives (English only; internal, not child-facing).
2. introScript — 2 to 3 spoken sentences where a friendly mascot greets the child and says
   what they will learn today, per language. (FR-LSN-01)
3. narrationScript — 60 to 120 spoken words teaching the concept with simple examples a
   3–6 year old sees in daily life, per language. (source text for video narration)
4. quizQuestions — 3 to 5 questions matched to the grade level, using a mix of the four
   formats (mcq, match_pair, drag_answer, picture_select), each conforming to the question
   schema, with prompts in every requested language.
```

`generators/lesson.ts` wires it together: build prompts → `runGenerationJob({ type: "lesson", schema: LessonGenerationOutputSchema, persist })` where `persist` creates Lesson (+slug from `lessonFocus`), translations, quiz, questions — re-running `safeParseQuizQuestion` per question before insert (defense in depth), all with `aiJobId: jobId`, returning `{ lessonId, quizId, questionIds }`. The admin dialog (`generate-lesson-dialog.tsx`) is a shadcn/ui form (grade select, subject→topic cascading selects, focus text, language checkboxes) that POSTs and routes to the job (full review UX comes in 37 — for now link to `/admin/curriculum` with a "sent to review queue" toast).

## Step-by-Step Plan

1. Run the `aiJobId` linkage migration (6 models + back-relations on `AIGenerationJob`); `prisma validate` + `pnpm db:migrate`. (~20 min)
2. Add `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` to `lib/env.ts` + `.env.example`; write `claude.ts` with `generateStructured` (no test against the live API — typecheck only). (~20 min)
3. Write failing tests for `runGenerationJob` with a stubbed `generate`: success path persists and ends `awaiting_review` with usage stored; status row visibly passes through `generating` (spy on update calls). (~25 min)
4. Tests for the retry path: first response invalid → `generate` called again with the feedback string containing the Zod issues → valid → `awaiting_review` with `attempts.length === 2`; twice invalid → `failed`, nothing persisted (transaction never ran). Implement `run-generation-job.ts` to green. (~35 min)
5. Write `LessonGenerationOutputSchema` + a valid fixture (reuse `@kidlearn/types` quiz fixtures inside it) and unit tests: missing requested locale rejected, 2 quiz questions rejected, valid fixture parses. (~20 min)
6. Implement `prompts/lesson.ts` and `generators/lesson.ts`; test with a mocked client returning the fixture: draft Lesson/Quiz/QuizQuestion rows exist, all `status: "draft"`, all `aiJobId` set, `lesson.quizId` wired, translations per requested locale. (~30 min)
7. Add `routes/admin/ai.ts` (`POST /generate/lesson`, zod `.strict()`, 401/403 guards) + Supertest; mount under `/api/admin/ai`. (~20 min)
8. Build the admin dialog, run one real generation locally against the live API (manual), confirm the job row + draft entities in Prisma Studio and that the student API does NOT return the lesson; `pnpm lint && pnpm typecheck && pnpm --filter server test`; update the tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes: job lifecycle (`pending → generating → awaiting_review`), retry-once-then-fail, persistence skipped on failure, token usage + both raw attempts stored in `rawOutput` (FR-AI-08).
- [ ] A generated lesson exists only as `draft` rows; `GET /api/content/lessons/:id` (student API) returns 404 for it — no code path in this file can set any status other than `draft`.
- [ ] Every generated `Lesson`, `Quiz`, and `QuizQuestion` row has `aiJobId` set to the creating job.
- [ ] Quiz questions in the fixture output parse with `parseQuizQuestion` from `@kidlearn/types` — the prompt's tool `input_schema` is generated from the very same Zod schema (assert with a snapshot test on `zodToJsonSchema(QuizQuestionSchema)`).
- [ ] A response missing one requested locale fails validation and triggers exactly one retry.
- [ ] `POST /api/admin/ai/generate/lesson` returns 401 unauthenticated, 403 for parents, 202 with `{ data: { jobId } }` for admins.
- [ ] Starting the server without `ANTHROPIC_API_KEY` exits non-zero naming the missing var.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Story and quiz generators (file 35 — they reuse `runGenerationJob` and the system-prompt persona).
- Audio narration, image generation, character sheets, and per-day cost caps (file 36).
- The review queue UI, approve/edit/reject decisions, and the `assertTransition` extension enforcing FR-AI-07 at publish time (file 37) — here it holds structurally because generators only write drafts.
- Background job queues / webhooks; MVP awaits generation inline within the request.
- Production API keys and spend monitoring (file 38).
