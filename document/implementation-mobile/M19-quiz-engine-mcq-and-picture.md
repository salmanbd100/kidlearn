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
- `apps/web/features/quiz/` is the reference: `QuizEngine.tsx`, `registry.tsx`, `types.ts`, `use-quiz-session.ts`, `use-option-choice.ts`, `use-question-feedback.ts`, `OptionCard.tsx`, `McqQuestion.tsx`, `PictureSelectQuestion.tsx`, `ProgressFruit.tsx`, `QuizScoreScreen.tsx`. `use-quiz-session.ts` is effectively platform-free — port its logic, do not re-derive it. Grading is not in `apps/web` at all: `evaluateAnswer` lives in `packages/types/src/quiz/evaluate.ts`.
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
2. **Session logic, ported.** `lib/quiz-session.ts` from `apps/web/features/quiz/use-quiz-session.ts`: a pure reducer over `{ index, answers, attempts }` with `answer(value)` and `next()`. Unit-tested against the fixtures in `packages/types/src/__fixtures__/quiz.ts`.
3. **Answer evaluation, imported.** Call `evaluateAnswer(question, answer)` from `@kidlearn/types` (`packages/types/src/quiz/evaluate.ts`) — do not port a second copy. The server runs the same function against the stored `definition` when it grades the submission, so client and server cannot disagree. The client evaluates only to give **immediate feedback**; the recorded score comes from the server.
4. **Retry policy.** Match the web app's: there is **no fail state and no attempt limit** (spec §5.7). A wrong answer holds a short retry beat (`RETRY_HOLD_MS = 600` in `use-question-feedback.ts`), marks the chosen option and lets the child try again until the right answer is chosen; only the correct answer commits and advances. Carry `attempts` (every tap, right or wrong, floor 1) into the record: the server stores `isCorrect` as *right on the first attempt* (`attempts === 1 && evaluateAnswer(...)`), and the reward grant, badges and weekly accuracy all read that.
5. **Renderer contract.** `components/quiz/quiz-props.ts`, mirroring web `QuestionProps`: `{ definition, locale, feedback, onAttempt(answer, isCorrect), onCommit(answer) }`. Renderers draw one question type and nothing else — no audio, no advancing, no scoring.
6. **MCQ renderer** (`components/quiz/McqQuestion.tsx`) — the localised prompt at display size, then 3–4 option cards stacked (portrait) or in a 2×2 grid (landscape / tablet). Each option ≥64px tall with ≥20px text, tappable across its whole area. Correct/incorrect states carry an **icon plus** colour.
7. **Picture-select renderer** (`components/quiz/PictureSelectQuestion.tsx`) — 3–4 image options in a grid via `expo-image`, prefetched before the question becomes interactive (a child must never tap a blank square). Each option ≥96px, with its localised label as the accessibility label even where the visual is image-only.
8. **`OptionCard`** — one shared pressable used by both renderers: variants for `idle | selected | correct | incorrect`, press spring (reduced-motion aware), and the icon+colour double encoding.
9. **Progress indicator.** Port the fruit motif from `apps/web/features/quiz/ProgressFruit.tsx` so the two clients look like one product; states differ by shape as well as colour.
10. **Answer collection.** The engine accumulates `QuizResponseRecord`-shaped entries (`{ questionId, answer, attempts }` — **no `isCorrect`**; keep a local-only `isFirstAttemptCorrect` for the score screen's star, as the web `QuizAnswerRecord` does) as it goes and hands them to `onComplete` — the submit call and the score screen belong to M20, so this file ends with the answers in hand and a placeholder score screen.
11. **Tests** (`lib/quiz-session.test.ts`, `lib/quiz-evaluate.test.ts`, `QuizEngine.test.tsx`, `McqQuestion.test.tsx`, `PictureSelectQuestion.test.tsx`): the session reducer advances and records; the evaluator matches the web app's verdicts on the shared fixtures; an unparseable question is skipped and excluded from the total; prompt audio plays once per question and again on the speaker; a wrong answer allows unlimited retries and only the correct answer advances; the correct answer advances after the feedback beat; MCQ renders 3–4 options at ≥64px; picture options prefetch before becoming interactive; every option is announced by a screen reader with its label.

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
  questionCount: number;
  currentIndex: number;
  attempts: number;                  // taps on the question on screen
  isFirstAttemptCorrect: boolean;    // latched on the first tap; local only
  records: { questionId: string; answer: QuizAnswerValue; attempts: number; isFirstAttemptCorrect: boolean }[];
};

type QuizSessionEvent =
  | { type: "ATTEMPT"; isCorrect: boolean }                      // every tap, right or wrong
  | { type: "COMMIT"; questionId: string; answer: QuizAnswerValue }; // the right answer, after its feedback

// ATTEMPT bumps `attempts` and latches first-attempt correctness; COMMIT appends a record with
// attempts = max(attempts, 1), advances currentIndex and resets the per-question fields.
// There is no maxAttempts and no "revealed" outcome.
```

Renderers report `ATTEMPT` and `COMMIT`; the engine owns the feedback beat, so the renderers stay dumb.

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
const STATE_ICON = { correct: <CheckIcon />, incorrect: <RetryIcon /> } as const;
```

Keep the localised prompt resolution in `lib/localized-label.ts` (M11) — `prompt[locale] ?? prompt.en` — rather than inline in each renderer.

## Step-by-Step Plan

1. Read the web quiz files that carry logic (`use-quiz-session.ts`, `use-question-feedback.ts`, `registry.tsx`) and note the feedback timings. (~25 min)
2. Wire `evaluateAnswer` from `@kidlearn/types` and test it against `packages/types/src/__fixtures__/quiz.ts`. (~20 min)
3. Port `lib/quiz-session.ts` with tests (attempt, commit, advance). (~35 min)
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
- [ ] Retry behaviour (unlimited, correct-only advance) and feedback timing match the web app's values.
- [ ] Correct/incorrect states are encoded by icon **and** colour, and read correctly in greyscale.
- [ ] MCQ options are ≥64px with ≥20px text; picture options are ≥96px and prefetched before becoming tappable.
- [ ] The progress indicator matches the web app's fruit motif and distinguishes states by shape.
- [ ] Grading comes from `evaluateAnswer` in `@kidlearn/types`; no local copy of the rules exists.
- [ ] The engine hands a complete set of answer records to `onComplete`; nothing is submitted yet.
- [ ] Every option is announced with its localised label by TalkBack and VoiceOver.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- `match_pair` and `drag_answer` renderers, submission to `POST /api/progress/quizzes/:quizId/responses`, and the real score screen — all M20.
- The reward step — M21.
- Client-side scoring as the recorded truth. The client evaluates for feedback only; `QuizScoreSchema` comes from the server.
- Adaptive difficulty or question shuffling. Not in the spec, and a shuffled order would break the server's per-question response records.
- Authoring quiz payloads — the admin CMS (`apps/web/features/admin/`) and the AI pipeline (`apps/server/src/modules/admin/ai/`).
