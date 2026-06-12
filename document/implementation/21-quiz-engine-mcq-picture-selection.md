# 21 — Quiz Engine: MCQ & Picture Selection

> **Estimated effort:** 3–4 hours
> **Depends on:** 07, 16
> **Requirement IDs:** FR-QUIZ-01, FR-QUIZ-04, FR-QUIZ-05, FR-QUIZ-07
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Build the JSON-driven `QuizEngine` that runs the 3–5 question quiz step of every lesson: it parses each question's `JSONB` payload via `@kidlearn/types`, shows one question at a time with a fruit-dot progress strip, autoplays the question audio in the child's language on every question mount (FR-QUIZ-05), and collects per-question answer records locally in the exact shape file 22's submission API will consume. Ship the first two formats — `McqQuestion` (FR-QUIZ-01) and `PictureSelectQuestion` (FR-QUIZ-04) — with a low-pressure, never-test-like interaction: single tap commits, wrong options dim gently, the child retries until correct.

## Context & Current State

Files 07 and 16 are done: `@kidlearn/types` exports `parseQuizQuestion` / `safeParseQuizQuestion`, the `QuizQuestionDefinition` union (`mcq | match_pair | drag_answer | picture_select`) and quiz fixtures; the lesson player shell renders a `QuizStep` placeholder receiving the lesson's quiz data (`{ id, questions: { id, definition }[] }`) and an `onComplete` callback. `useAudio()` exists for narration. The activity feedback patterns (cheer/encourage audio pools, confetti, wiggle) exist if file 18 has landed, but this file must not depend on 18 — build `QuestionFeedback` against the same audio assets so the two can later share. Submission and scoring (POST to the server) land in file 22; here, answers stay in client state designed for that handoff.

## Detailed Requirements

1. **FR-QUIZ-07 — JSON-driven engine:** `QuizEngine` receives raw question payloads, validates each with `safeParseQuizQuestion`, and dispatches on `type` via a registry (mirroring the activity engine pattern). Invalid questions are skipped with a console error (never trap the child); if *all* questions are invalid, the engine calls the finish callback immediately with an empty record list.
2. **One question at a time** with a progress strip of fruit dots (one per question; filled = answered, current = bouncing) — visual, no numbers/percentages for the child.
3. **FR-QUIZ-05 — question audio:** on each question mount, autoplay `promptAudio[locale]`; a large replay button (≥64px) repeats it. The prompt text renders too (`prompt[locale]`) for pre-readers' parents, but audio is the primary channel.
4. **Local answer state (file 22 plugs into this):** the engine accumulates `QuizAnswerRecord[]` — `{ questionId: string; answer: QuizAnswerValue; isCorrect: boolean; attempts: number }` — where `attempts` counts taps on this question until correct, `answer` is the final (correct) committed value, and `isCorrect` reflects whether the FIRST attempt was correct (this is what scoring/coins use; document it on the type). After the last question, call `onFinish(records)`; in this file `QuizStep` wires `onFinish` to advance via `onComplete` (22 replaces that with submit-then-score-screen).
5. **FR-QUIZ-01 — McqQuestion:** 3–4 large option cards showing `text[locale]` and/or image. **Single tap commits** (recommended for this age — no select-then-confirm): on tap the card locks input briefly while feedback plays. Correct → cheer + green glow + auto-advance after ~1.2s. Wrong → encouraging audio + that option dims to 40% opacity and becomes disabled; the child retries among remaining options. Never red ✗, never "wrong!" copy (§5.7).
6. **FR-QUIZ-04 — PictureSelectQuestion:** a 2×2 (or 1×3) grid of picture cards, identical interaction; images are required by the schema, so the card is image-first with an optional small label.
7. **Shared `QuestionFeedback` layer:** correct/incorrect handling (sfx pools, glow/dim classes, input lock timing) lives in one `useQuestionFeedback` hook + overlay component used by every format — file 22's formats reuse it unchanged.
8. **Pure logic with unit tests:** `evaluateAnswer(question, answer): boolean` handles both formats (and is structured so 22 adds the other two cases); the engine's record-accumulation reducer is also pure and tested (attempts increment, first-attempt correctness, advance on commit).

## Technical Approach & Suggestions

Files to create (under `/Users/salmanrahman/Documents/kidlearn/apps/web/`):

```
components/quiz/QuizEngine.tsx            # session state, progress fruit, dispatch
components/quiz/registry.ts               # type → question component map
components/quiz/types.ts                  # QuizAnswerRecord, QuizAnswerValue, QuestionProps
components/quiz/evaluateAnswer.ts          # pure
components/quiz/useQuizSession.ts          # reducer hook (pure logic extracted)
components/quiz/useQuestionFeedback.ts     # shared correct/wrong feedback + input lock
components/quiz/McqQuestion.tsx
components/quiz/PictureSelectQuestion.tsx
components/quiz/ProgressFruit.tsx
components/quiz/evaluateAnswer.test.ts
components/quiz/useQuizSession.test.ts
components/quiz/McqQuestion.test.tsx
components/quiz/PictureSelectQuestion.test.tsx
```

Modify: `components/lesson/QuizStep.tsx` (file-16 placeholder) to render the engine.

Exact contracts (`components/quiz/types.ts`):

```ts
import type { QuizQuestionDefinition, Locale } from "@kidlearn/types";

/** string = chosen optionId (mcq, picture_select, drag_answer);
 *  pairs variant added for match_pair in file 22. */
export type QuizAnswerValue = string | { pairs: { leftId: string; rightId: string }[] };

export interface QuizAnswerRecord {
  questionId: string;
  answer: QuizAnswerValue;  // final committed (correct) answer
  isCorrect: boolean;       // true only if the FIRST attempt was correct
  attempts: number;         // total attempts until correct (>= 1)
}

export interface QuestionProps<T extends QuizQuestionDefinition = QuizQuestionDefinition> {
  definition: T;
  locale: Locale;
  feedback: QuestionFeedback;                       // from useQuestionFeedback()
  onAttempt: (answer: QuizAnswerValue, correct: boolean) => void; // every tap
  onCommit: (answer: QuizAnswerValue) => void;      // correct answer accepted → engine advances
}

export interface QuizEngineProps {
  quizId: string;
  questions: { id: string; definition: unknown }[];
  locale: Locale;
  onFinish: (records: QuizAnswerRecord[]) => void;
}
```

```ts
// evaluateAnswer.ts — pure, exhaustive switch (22 extends the two remaining cases)
export function evaluateAnswer(
  question: QuizQuestionDefinition,
  answer: QuizAnswerValue,
): boolean {
  switch (question.type) {
    case "mcq":
    case "picture_select":
      return answer === question.correctOptionId;
    case "drag_answer":
    case "match_pair":
      throw new Error(`evaluateAnswer: ${question.type} lands in file 22`);
  }
}
```

`useQuizSession(questions, onFinish)` reducer events: `{ type: "attempt", correct: boolean }` increments `attempts` and latches `firstAttemptCorrect` on attempt 1; `{ type: "commit", answer }` pushes the `QuizAnswerRecord`, advances `currentIndex`, and fires `onFinish` after the last commit. Keep the reducer a pure exported function (`quizSessionReducer`) so tests don't need React.

`useQuestionFeedback` behavior: `correct(anchorEl?)` → play cheer (reuse `/audio/feedback/cheer-*.mp3`), apply green glow, lock input, resolve after 1200ms; `wrong()` → play `/audio/feedback/retry-{locale}-*.mp3`, lock input 600ms. Expose `locked: boolean`; question components ignore taps while locked.

`McqQuestion` sketch: `grid grid-cols-1 landscape:grid-cols-2 gap-4`; each option a `<button>` `min-h-24 rounded-3xl text-3xl` with image (if present) above `text[locale]`; tap → if locked return; `const correct = evaluateAnswer(definition, option.id); onAttempt(option.id, correct);` then `correct ? (feedback.correct(el), setTimeout(() => onCommit(option.id), 1200)) : (feedback.wrong(), dim(option.id))`. Dimmed options get `opacity-40 pointer-events-none transition-opacity`. `PictureSelectQuestion` is the same flow with `grid-cols-2` square `aspect-square` image cards (image fills the card, `alt[locale]` as alt text).

`ProgressFruit`: `questions.length` dots, `🍎`-style SVG/emoji per design.md tokens; answered = full color, current = `animate-bounce`, upcoming = `opacity-30`. Question audio autoplay: `useEffect(() => audio.play(definition.promptAudio[locale].url), [definition])` keyed by question id so advancing re-triggers.

## Step-by-Step Plan

1. Create `types.ts`; write failing `evaluateAnswer.test.ts` for mcq + picture_select (correct id true, wrong id false) using file-07 fixtures; implement → green. (~20 min)
2. Write failing tests for `quizSessionReducer`: first-attempt-correct latching, attempts counting across wrong taps, commit advances index, last commit produces the full `QuizAnswerRecord[]`. (~25 min)
3. Implement `useQuizSession.ts` (pure reducer + thin hook) → green. (~20 min)
4. Implement `useQuestionFeedback.ts` (audio pools, lock timing with `vi.useFakeTimers()`-friendly timeouts) and `ProgressFruit.tsx`. (~25 min)
5. Write failing `McqQuestion.test.tsx`: tap wrong option → dims + stays on question + `onAttempt(_, false)`; tap correct → `onAttempt(_, true)` then `onCommit` after the lock window; taps ignored while locked. (~25 min)
6. Implement `McqQuestion.tsx` and `PictureSelectQuestion.tsx` (shared option-card subcomponent). (~30 min)
7. Implement `QuizEngine.tsx` (safeParse + skip invalid, registry dispatch, audio autoplay per mount, fruit strip) + engine test: two-question fixture run start→finish calls `onFinish` with two records. (~25 min)
8. Wire `QuizStep.tsx` (`onFinish` → `onComplete` for now); manual run in `pnpm dev` (portrait + landscape, touch); `pnpm lint && pnpm typecheck && pnpm --filter web test`; update tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes including `evaluateAnswer.test.ts`, `useQuizSession.test.ts`, and both question-component tests.
- [ ] `QuizEngine` runs a 3-question fixture session and calls `onFinish` with records of shape `{questionId, answer, isCorrect, attempts}`; a wrong-then-right question yields `isCorrect: false, attempts: 2`.
- [ ] Question audio autoplays in the child's locale on every question mount and is replayable from a ≥64px button (FR-QUIZ-05).
- [ ] Wrong taps dim the option, play encouraging audio, and let the child retry — no red ✗, no failure copy, no visible scoring during the quiz (§5.7).
- [ ] Correct taps glow + cheer and auto-advance after the lock window; double-taps during the lock are ignored.
- [ ] A malformed question payload is skipped without crashing; an all-invalid quiz still calls `onFinish([])`.
- [ ] MCQ and picture-select cards meet touch-target sizes (option cards ≥ 96px tall) in portrait and landscape.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- `match_pair` and `drag_answer` formats, the response-submission API, scoring onto `LessonProgress`, and the score screen (all file 22).
- Reward granting and the celebration step (23); badges (24).
- Storing per-question responses for the parent dashboard (22 posts them; dashboard reads in 29).
- AI quiz generation against these schemas (35).
