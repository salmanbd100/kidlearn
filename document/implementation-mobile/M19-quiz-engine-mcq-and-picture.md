# M19 — Quiz Engine, MCQ & Picture Select

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-QUIZ-01, FR-QUIZ-04, FR-QUIZ-05, FR-QUIZ-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the quiz half of the lesson: a JSON-driven quiz engine mirroring the activity engine's architecture, plus the two tap-based question renderers — multiple choice and picture selection. The engine owns the session (which question, what has been answered, the prompt audio, the per-question feedback); each renderer draws one question type and reports an answer.

## Context & Current State

- `packages/types/src/quiz/schemas.ts` owns the contract. `QuizQuestionSchema` is a union of four types, all `schemaVersion: 1`, all carrying `prompt: LocalizedTextSchema` and `promptAudio: LocalizedAudioSchema`:
  - `mcq` — `options` (3–4 `QuizOptionSchema`);
  - `picture_select` — `options` (3–4 `PictureQuizOptionSchema`);
  - `match_pair` — `leftColumn` (2–6), plus its right column (M20);
  - `drag_answer` — a prompt carrying **exactly one `{blank}` token per locale**, the drop position (M20).
- `parseQuizQuestion` / `safeParseQuizQuestion` are exported from `packages/types`. Parse at the boundary, exactly as the activity engine does — the payload is AI/CMS-authored JSONB.
- `POST /api/progress/quizzes/:quizId/responses` records answers (`QuizResponsesBodySchema` on the way in, `QuizResponsesSubmit` / `QuizResponseRecord` in `packages/types`). `QuizScoreSchema` is the response shape: `{ lessonId, score (0–100), correctCount, totalQuestions }`. **The score is the server's** — the client shows what it is told (FR-QUIZ-06, wired fully in M20).
- `apps/web/components/quiz/` is the reference: `QuizEngine.tsx`, `registry.tsx`, `types.ts`, `use-quiz-session.ts`, `use-option-choice.ts`, `use-question-feedback.ts`, `evaluate-answer.ts`, `OptionCard.tsx`, `McqQuestion.tsx`, `PictureSelectQuestion.tsx`, `ProgressFruit.tsx`, `QuizScoreScreen.tsx`. `evaluate-answer.ts` and `use-quiz-session.ts` are effectively platform-free — port their logic, do not re-derive it.
- M13 gives the step contract and the `quiz` placeholder this file replaces. M14 gives prompt audio and feedback sounds. M16 established the engine/registry/renderer split — follow the same shape so the two engines read alike.
- design.md §7 and §10: ≥64px targets, ≥20px text, feedback never colour-only, kid copy 1–4 words with an icon, and no scolding for a wrong answer.

## Detailed Requirements

1. **`components/quiz/QuizEngine.tsx`** — receives the lesson's quiz payload (`unknown`), parses each question with `safeParseQuizQuestion`, and owns:
   - the session: current index, recorded answers, per-question attempt count;
   - the prompt audio on each question's arrival plus a ≥64px replay speaker;
   - the feedback beat after each answer (correct sound + tick, or try-again sound + gentle wiggle);
   - the progress indicator across questions;
   - advancing to the next question, and calling `onComplete(responses)` at the end.
   A question that fails to parse is **skipped** (not fatal) and excluded from the total, so one bad payload cannot block a lesson. Log nothing; just skip.
2. **Session logic, ported.** `lib/quiz-session.ts` from `apps/web/components/quiz/use-quiz-session.ts`: a pure reducer over `{ index, answers, attempts }` with `answer(value)` and `next()`. Unit-tested against the fixtures in `packages/types/src/__fixtures__/quiz.ts`.
3. **Answer evaluation, ported.** `lib/quiz-evaluate.ts` from `apps/web/components/quiz/evaluate-answer.ts` — pure, per question type, tested against the same fixtures. The client evaluates only to give **immediate feedback**; the recorded score comes from the server.
4. **Retry policy.** Match the web app's: a wrong answer gives another attempt with the chosen option marked, up to the same limit the web app uses, then reveals the correct answer and moves on. Read `use-question-feedback.ts` and carry the same numbers — a quiz that is harder on mobile than on the web is a bug.
5. **Renderer contract.** `components/quiz/quiz-props.ts`: `{ question, locale, disabled, onAnswer(value), selected }`. Renderers draw one question type and nothing else — no audio, no advancing, no scoring.
6. **MCQ renderer** (`components/quiz/McqQuestion.tsx`) — the localised prompt at display size, then 3–4 option cards stacked (portrait) or in a 2×2 grid (landscape / tablet). Each option ≥64px tall with ≥20px text, tappable across its whole area. Correct/incorrect states carry an **icon plus** colour.
7. **Picture-select renderer** (`components/quiz/PictureSelectQuestion.tsx`) — 3–4 image options in a grid via `expo-image`, prefetched before the question becomes interactive (a child must never tap a blank square). Each option ≥96px, with its localised label as the accessibility label even where the visual is image-only.
8. **`OptionCard`** — one shared pressable used by both renderers: variants for `idle | selected | correct | incorrect | revealed`, press spring (reduced-motion aware), and the icon+colour double encoding.
9. **Progress indicator.** Port the fruit motif from `apps/web/components/quiz/ProgressFruit.tsx` so the two clients look like one product; states differ by shape as well as colour.
10. **Answer collection.** The engine accumulates `QuizResponseRecord`-shaped entries as it goes and hands them to `onComplete` — the submit call and the score screen belong to M20, so this file ends with the answers in hand and a placeholder score screen.
11. **Tests** (`lib/quiz-session.test.ts`, `lib/quiz-evaluate.test.ts`, `QuizEngine.test.tsx`, `McqQuestion.test.tsx`, `PictureSelectQuestion.test.tsx`): the session reducer advances and records; the evaluator matches the web app's verdicts on the shared fixtures; an unparseable question is skipped and excluded from the total; prompt audio plays once per question and again on the speaker; a wrong answer allows a retry and then reveals; the correct answer advances after the feedback beat; MCQ renders 3–4 options at ≥64px; picture options prefetch before becoming interactive; every option is announced by a screen reader with its label.

## Technical Approach & Suggestions

```
apps/mobile/components/quiz/QuizEngine.tsx
apps/mobile/components/quiz/QuizEngine.test.tsx
apps/mobile/components/quiz/registry.tsx
apps/mobile/components/quiz/quiz-props.ts
apps/mobile/components/quiz/OptionCard.tsx
apps/mobile/components/quiz/McqQuestion.tsx
apps/mobile/components/quiz/PictureSelectQuestion.tsx
apps/mobile/components/quiz/ProgressFruit.tsx
apps/mobile/lib/quiz-session.ts
apps/mobile/lib/quiz-session.test.ts
apps/mobile/lib/quiz-evaluate.ts
apps/mobile/lib/quiz-evaluate.test.ts
apps/mobile/components/lesson/steps/QuizStep.tsx        # replaces M13's placeholder
```

Skip rather than fail on a bad question — the difference between one broken payload and a blocked lesson:

```tsx
const questions = useMemo(
  () =>
    rawQuestions
      .map((raw) => safeParseQuizQuestion(raw))
      .filter((r): r is { success: true; data: QuizQuestionDefinition } => r.success)
      .map((r) => r.data),
  [rawQuestions],
);

// An empty quiz is not an error state for the child: report the step and move on.
useEffect(() => {
  if (questions.length === 0) onComplete([]);
}, [questions.length, onComplete]);
```

The pure session reducer:

```ts
export type QuizSessionState = {
  index: number;
  answers: { questionId: string; value: QuizAnswerValue; correct: boolean; attempts: number }[];
  attempts: number;
};

export function recordAnswer(
  state: QuizSessionState,
  question: QuizQuestionDefinition,
  value: QuizAnswerValue,
  isCorrect: (q: QuizQuestionDefinition, v: QuizAnswerValue) => boolean,
  maxAttempts: number,
): { state: QuizSessionState; outcome: "correct" | "retry" | "revealed" } {
  const correct = isCorrect(question, value);
  if (correct) {
    return {
      state: { ...state, answers: [...state.answers, { questionId: question.id, value, correct: true, attempts: state.attempts + 1 }], attempts: 0 },
      outcome: "correct",
    };
  }
  if (state.attempts + 1 < maxAttempts) return { state: { ...state, attempts: state.attempts + 1 }, outcome: "retry" };
  return {
    state: { ...state, answers: [...state.answers, { questionId: question.id, value, correct: false, attempts: state.attempts + 1 }], attempts: 0 },
    outcome: "revealed",
  };
}
```

Returning an `outcome` rather than mutating UI state is what lets the engine own the feedback beat and the renderers stay dumb.

Prefetch picture options before enabling taps:

```tsx
const [ready, setReady] = useState(false);
useEffect(() => {
  void Image.prefetch(question.options.map((o) => o.imageUrl)).then(() => setReady(true));
}, [question]);

<OptionCard disabled={!ready} … />
```

Double-encode feedback so it survives colour blindness and a greyscale screenshot:

```tsx
const STATE_ICON = { correct: <CheckIcon />, incorrect: <RetryIcon />, revealed: <ArrowIcon /> } as const;
```

Keep the localised prompt resolution in `lib/localized-label.ts` (M11) — `prompt[locale] ?? prompt.en` — rather than inline in each renderer.

## Step-by-Step Plan

1. Read the four web quiz files that carry logic (`use-quiz-session.ts`, `evaluate-answer.ts`, `use-question-feedback.ts`, `registry.tsx`) and note the retry limit and feedback timings. (~25 min)
2. Port `lib/quiz-evaluate.ts` with tests against `packages/types/src/__fixtures__/quiz.ts`. (~35 min)
3. Port `lib/quiz-session.ts` with tests (record, retry, reveal, advance). (~35 min)
4. Build `OptionCard` with its five states, icon+colour encoding and reduced-motion press. (~30 min)
5. Build `McqQuestion` (portrait stack, landscape grid) and its test. (~30 min)
6. Build `PictureSelectQuestion` with prefetch gating and its test. (~30 min)
7. Build `ProgressFruit` ported from the web motif. (~20 min)
8. Build `QuizEngine`: parse + skip, prompt audio + speaker, feedback beat, progress, answer accumulation, `onComplete`. Test each behaviour. (~50 min)
9. Replace M13's quiz placeholder with `QuizStep`; walk a seeded lesson's quiz on a **physical device** in both orientations and both languages, with a deliberately malformed question in the payload. (~30 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Questions are parsed with `safeParseQuizQuestion` at the boundary; an unparseable question is skipped and excluded from the total without blocking the lesson.
- [ ] An empty or fully-unparseable quiz completes the step instead of trapping the child.
- [ ] Prompt audio plays once per question and is replayable from a ≥64px speaker.
- [ ] Retry limit, feedback timing and reveal behaviour match the web app's values.
- [ ] Correct/incorrect/revealed states are encoded by icon **and** colour, and read correctly in greyscale.
- [ ] MCQ options are ≥64px with ≥20px text; picture options are ≥96px and prefetched before becoming tappable.
- [ ] The progress indicator matches the web app's fruit motif and distinguishes states by shape.
- [ ] `lib/quiz-evaluate.ts` agrees with the web app's `evaluate-answer.ts` on the shared fixtures.
- [ ] The engine hands a complete set of answer records to `onComplete`; nothing is submitted yet.
- [ ] Every option is announced with its localised label by TalkBack and VoiceOver.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- `match_pair` and `drag_answer` renderers, submission to `POST /api/progress/quizzes/:quizId/responses`, and the real score screen — all M20.
- The reward step — M21.
- Client-side scoring as the recorded truth. The client evaluates for feedback only; `QuizScoreSchema` comes from the server.
- Adaptive difficulty or question shuffling. Not in the spec, and a shuffled order would break the server's per-question response records.
- Authoring quiz payloads — the CMS (web file 33) and the AI pipeline (web file 35).
