# 07 — Shared Types: Activity & Quiz JSON Schemas

> **Estimated effort:** 3–4 hours
> **Depends on:** 01
> **Requirement IDs:** FR-ACT-06, FR-QUIZ-07, NFR-SCALE-02, spec §7.3.2
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the single source of truth for activity and quiz JSON payloads in `packages/types`: versioned Zod schemas plus inferred TypeScript types for the four activity types (drag_drop, trace, match, puzzle) and the four quiz question formats (mcq, match_pair, drag_answer, picture_select). These schemas will be consumed by three independent parties — frontend renderers (files 18–22), backend validators (files 12, 33, 35), and AI generation prompts (files 34–35) — so they must be precise, locale-aware, and additive-versioned per NFR-SCALE-02.

## Context & Current State

File 01 is done: `packages/types` has a `package.json` (name `@kidlearn/types`), `tsconfig.json`, a `src/index.ts` barrel, `dev`/`build`/`typecheck` scripts, and Vitest is configured workspace-wide. `zod` may not yet be a dependency of the package — add it here. No activity/quiz schema code exists anywhere yet. The Prisma models that will store these payloads as `JSONB` (Activity.definition, QuizQuestion.definition) come in file 05; this file is independent of the database and must not import Prisma.

## Detailed Requirements

1. **Shared primitives** (used by both families):
   - `LocalizedText = Record<'en' | 'bn', string>` — every child-facing string is per-locale, both locales required (FR-I18N-01).
   - `AssetRef` — `{ kind: 'image' | 'audio' | 'video', url: string (https URL), alt?: LocalizedText }`.
   - `LocalizedAudio = Record<'en' | 'bn', AssetRef>` constrained to `kind: 'audio'` (FR-QUIZ-05, FR-I18N-05).
2. **Versioning (NFR-SCALE-02):** every payload carries `schemaVersion: 1` as a Zod literal. Future revisions add `z.literal(2)` variants to a union — existing stored JSON must keep parsing. Document this rule in the source file header.
3. **Activity payloads (FR-ACT-06)** — discriminated union on `type`:
   - `drag_drop`: draggable `items[]` (id, label LocalizedText, image/audio AssetRefs), drop `targets[]` (id, label, image), and `correctMappings[]` of `{ itemId, targetId }` — every item must map to an existing target (refine).
   - `trace`: glyph identifier (`glyph: string`, e.g. "A" or "৩"), `pathData: string` (SVG path the child traces), `guideDots: { x: number, y: number }[]` (min 2), `strokeOrder?: number[]`, prompt audio per locale.
   - `match`: `leftSet[]` and `rightSet[]` of items (id, label, image/audio refs), `pairs[]` of `{ leftId, rightId }` — each side used at most once (refine).
   - `puzzle`: `image: AssetRef`, `grid: { rows: number, cols: number }` (2–4 each), `slots[]` of `{ index, row, col }` covering the grid.
4. **Quiz question payloads (FR-QUIZ-07)** — discriminated union on `type`; every format has `prompt: LocalizedText` and `promptAudio: LocalizedAudio` (FR-QUIZ-05):
   - `mcq`: 3–4 `options[]` (id, text LocalizedText, optional image/audio AssetRef), `correctOptionId` that must exist among options (refine). (FR-QUIZ-01)
   - `match_pair`: two columns + `correctPairs[]`, same shape rules as the match activity. (FR-QUIZ-02)
   - `drag_answer`: a `sentence: LocalizedText` containing a `{blank}` token, `options[]`, `correctOptionId`. (FR-QUIZ-03)
   - `picture_select`: `options[]` where image is **required**, `correctOptionId`. (FR-QUIZ-04)
5. **Parse helpers:** export `parseActivityDefinition(json: unknown): ActivityDefinition` and `parseQuizQuestion(json: unknown): QuizQuestionDefinition` that throw `ZodError` on invalid input, plus `safeParseActivityDefinition` / `safeParseQuizQuestion` wrappers returning Zod's `SafeParseReturnType` for validators that must not throw.
6. **Inferred types exported** for all schemas (`ActivityDefinition`, `DragDropActivity`, `QuizQuestionDefinition`, `McqQuestion`, …) — frontend and server import types from here, never redeclare.
7. **Fixtures:** valid + invalid JSON fixtures per type under `src/__fixtures__/`, exported (the seed script in file 12 and AI prompt examples in file 34 reuse the valid ones).
8. **Unit tests** covering every type's valid fixture, every refine rule, missing-locale rejection, and wrong `schemaVersion` rejection.

## Technical Approach & Suggestions

Files to create (all under `/Users/salmanrahman/Documents/kidlearn/packages/types/`):

```
src/
  primitives.ts                 # Locale, LocalizedText, AssetRef, LocalizedAudio
  activity/schemas.ts           # four activity schemas + ActivityDefinitionSchema union
  activity/parse.ts             # parseActivityDefinition / safeParseActivityDefinition
  quiz/schemas.ts               # four question schemas + QuizQuestionSchema union
  quiz/parse.ts                 # parseQuizQuestion / safeParseQuizQuestion
  __fixtures__/activities.ts    # validDragDrop, invalidDragDropUnknownTarget, ...
  __fixtures__/quiz.ts          # validMcq, invalidMcqBadCorrectId, ...
  index.ts                      # barrel: export everything above
src/activity/schemas.test.ts
src/quiz/schemas.test.ts
```

Add `"zod": "^3.24.0"` to `packages/types/package.json` dependencies.

`src/primitives.ts`:

```ts
import { z } from "zod";

export const LocaleSchema = z.enum(["en", "bn"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const LocalizedTextSchema = z.record(LocaleSchema, z.string().min(1));
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const AssetRefSchema = z.object({
  kind: z.enum(["image", "audio", "video"]),
  url: z.string().url(),
  alt: LocalizedTextSchema.optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const LocalizedAudioSchema = z.record(
  LocaleSchema,
  AssetRefSchema.extend({ kind: z.literal("audio") }),
);
export type LocalizedAudio = z.infer<typeof LocalizedAudioSchema>;
```

Note: `z.record(LocaleSchema, …)` in Zod 3 makes keys optional in the inferred type; if both locales must be statically required, use `z.object({ en: z.string().min(1), bn: z.string().min(1) })` instead — prefer the `z.object` form for `LocalizedTextSchema` so TypeScript enforces both locales at compile time.

`src/activity/schemas.ts` (drag_drop shown in full; trace/match/puzzle follow the same pattern):

```ts
import { z } from "zod";
import { AssetRefSchema, LocalizedAudioSchema, LocalizedTextSchema } from "../primitives";

export const DragDropActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("drag_drop"),
    instructionAudio: LocalizedAudioSchema,
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          label: LocalizedTextSchema,
          image: AssetRefSchema.optional(),
          audio: LocalizedAudioSchema.optional(),
        }),
      )
      .min(2)
      .max(6),
    targets: z
      .array(z.object({ id: z.string().min(1), label: LocalizedTextSchema, image: AssetRefSchema }))
      .min(2)
      .max(6),
    correctMappings: z.array(z.object({ itemId: z.string(), targetId: z.string() })).min(1),
  })
  .superRefine((val, ctx) => {
    const itemIds = new Set(val.items.map((i) => i.id));
    const targetIds = new Set(val.targets.map((t) => t.id));
    for (const m of val.correctMappings) {
      if (!itemIds.has(m.itemId) || !targetIds.has(m.targetId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `mapping ${m.itemId}→${m.targetId} references unknown id` });
      }
    }
    if (val.correctMappings.length !== itemIds.size) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "every item must have exactly one mapping" });
    }
  });
export type DragDropActivity = z.infer<typeof DragDropActivitySchema>;

// TraceActivitySchema: glyph, pathData (z.string().min(1)), guideDots (array of {x,y} min 2), strokeOrder optional
// MatchActivitySchema: leftSet, rightSet, pairs — refine pair ids exist and each id used once
// PuzzleActivitySchema: image, grid {rows: z.number().int().min(2).max(4), cols: same}, slots — refine slots.length === rows*cols

export const ActivityDefinitionSchema = z.discriminatedUnion("type", [
  DragDropActivitySchema.sourceType(), // see note below
  TraceActivitySchema,
  MatchActivitySchema,
  PuzzleActivitySchema,
]);
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;
```

**Important Zod 3 caveat:** `z.discriminatedUnion` rejects members wrapped in `.superRefine()`/`.refine()` (they are `ZodEffects`, not `ZodObject`). Use one of: (a) `z.union([...])` of the refined schemas — fine here, error messages stay good because `type` literals mismatch fast; or (b) keep base objects in the discriminated union and apply cross-field refinement inside the parse helpers. Pick (a): plain `z.union`, it is the least code. Do not ship `.sourceType()` — that line above is illustrative of the problem, not the solution.

`src/quiz/schemas.ts` (mcq shown in full):

```ts
const QuizOptionSchema = z.object({
  id: z.string().min(1),
  text: LocalizedTextSchema.optional(),
  image: AssetRefSchema.optional(),
  audio: LocalizedAudioSchema.optional(),
});

export const McqQuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mcq"),
    prompt: LocalizedTextSchema,
    promptAudio: LocalizedAudioSchema,
    options: z.array(QuizOptionSchema).min(3).max(4),
    correctOptionId: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (!val.options.some((o) => o.id === val.correctOptionId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "correctOptionId not found in options" });
    }
    if (!val.options.every((o) => o.text || o.image)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "each option needs text or image" });
    }
  });
export type McqQuestion = z.infer<typeof McqQuestionSchema>;

export const QuizQuestionSchema = z.union([
  McqQuestionSchema, MatchPairQuestionSchema, DragAnswerQuestionSchema, PictureSelectQuestionSchema,
]);
export type QuizQuestionDefinition = z.infer<typeof QuizQuestionSchema>;
```

`src/activity/parse.ts`:

```ts
export function parseActivityDefinition(json: unknown): ActivityDefinition {
  return ActivityDefinitionSchema.parse(json);
}
export function safeParseActivityDefinition(json: unknown) {
  return ActivityDefinitionSchema.safeParse(json);
}
```

(`parseQuizQuestion`/`safeParseQuizQuestion` mirror this.)

For `drag_answer`, refine that `sentence.en` and `sentence.bn` each contain exactly one `{blank}` token: `(s.match(/\{blank\}/g) ?? []).length === 1`. For `picture_select`, make `image` required on the option (extend `QuizOptionSchema` with `image: AssetRefSchema`).

## Step-by-Step Plan

1. Add `zod` to `packages/types`, create `src/primitives.ts`, and write `primitives` assertions inside the two test files (valid AssetRef parses; bad URL rejected). Run `pnpm --filter @kidlearn/types test` — red, then green. (~20 min)
2. Write failing tests for `DragDropActivitySchema`: valid fixture parses; mapping to unknown target rejected; item without mapping rejected; `schemaVersion: 2` rejected. (~20 min)
3. Implement `DragDropActivitySchema` + the valid/invalid fixtures in `__fixtures__/activities.ts` until green. (~25 min)
4. Tests + implementation for `TraceActivitySchema` (guideDots min 2, empty pathData rejected) and `MatchActivitySchema` (duplicate-side-use rejected). (~30 min)
5. Tests + implementation for `PuzzleActivitySchema` (slot count must equal rows×cols) and the `ActivityDefinitionSchema` union + `parse.ts` helpers (unknown `type` rejected through the helper). (~25 min)
6. Tests + implementation for `McqQuestionSchema` (bad correctOptionId, 2 options, missing `bn` prompt all rejected) and fixtures in `__fixtures__/quiz.ts`. (~25 min)
7. Tests + implementation for `MatchPairQuestionSchema`, `DragAnswerQuestionSchema` (`{blank}` token rule), `PictureSelectQuestionSchema` (image required), union + quiz parse helpers. (~30 min)
8. Wire everything through `src/index.ts`, run `pnpm lint && pnpm typecheck && pnpm --filter @kidlearn/types test`, fix fallout, update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter @kidlearn/types test` passes with at least one valid-parse and two invalid-rejection tests per payload type (8 types total).
- [ ] `parseActivityDefinition(validDragDrop)` returns a value typed `ActivityDefinition`; `parseActivityDefinition({ type: "nope" })` throws `ZodError`.
- [ ] A payload missing the `bn` locale on any `LocalizedText`/`LocalizedAudio` fails to parse.
- [ ] `schemaVersion` other than `1` fails to parse for every type.
- [ ] All schemas, inferred types, parse helpers, and valid fixtures are importable from the package root: `import { McqQuestionSchema, parseQuizQuestion, type ActivityDefinition } from "@kidlearn/types"`.
- [ ] `pnpm lint` (Biome, repo root) and `pnpm typecheck` pass.
- [ ] No imports from `@kidlearn/db`, Prisma, Express, or React anywhere in `packages/types`.

## Out of Scope

- Storing payloads in Postgres / Prisma models (file 05) and validating rows at the API layer (files 12, 33).
- Rendering engines for activities (18–20) and quizzes (21–22).
- Embedding these schemas into AI prompts and validating AI output (34–35).
- Story page schemas (file 05 data model; reader in 26), world theming tokens (13), `schemaVersion: 2` of anything.
