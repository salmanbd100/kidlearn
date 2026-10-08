# M19 — Quiz Engine, MCQ & Picture Select

> **Estimated effort:** 3–4 hours
> **Depends on:** M13
> **Requirement IDs:** FR-QUIZ-01, FR-QUIZ-04, FR-QUIZ-05, FR-QUIZ-07
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Build the quiz half of the lesson: a JSON-driven quiz engine mirroring the activity engine's architecture, plus the two tap-based question renderers — multiple choice and picture selection. The engine owns the session (which question, what has been answered, the prompt audio, the per-question feedback); each renderer draws one question type and reports an answer.

## Context & Current State

- `packages/types/src/quiz/schemas.ts` owns the contract. `QuizQuestionSchema` is a union of four types, all `schemaVersion: 1`, all carrying `prompt: LocalizedTextSchema` and `promptAudio: LocalizedAudioSchema`. An option is `{ id, text?, image?, audio? }` (`text` localised, `image` an `ImageAssetRef`, `audio` a `LocalizedAudio`):
  - `mcq` — `options` (3–4, each needing `text` or `image`), `correctOptionId`;
  - `picture_select` — `options` (3–4, `image` required), `correctOptionId`;
  - `match_pair` — `leftColumn` / `rightColumn` (2–6 each), `correctPairs` (M20);
  - `drag_answer` — a `sentence` carrying **exactly one `{blank}` token per locale**, `options` (2–4), `correctOptionId` (M20).
- The lesson payload hands the engine `lesson.quiz` (`{ id, title, questions: [{ id, format, schemaVersion, sortOrder, definition }] }`, or `null`). Parse each `definition` with **`readQuizQuestion`** — the read path (migrate + lenient), as the server does when grading. `safeParseQuizQuestion` is the strict write-path check and must not be used on a stored payload.
- `POST /api/progress/quizzes/:quizId/responses` records answers (`QuizResponsesSubmitSchema`: `{ responses: [{ questionId, answer, attempts }] }`, 1–10 responses, unique `questionId`s, `attempts` an integer 1–50). **There is no `isCorrect`** — the server grades with `evaluateAnswer` and stores `isCorrect = attempts === 1 && evaluateAnswer(...)`. It answers `QuizScoreSchema` `{ lessonId, score (0–100), correctCount, totalQuestions }`. Submission and its handling are M20.
- `apps/web/features/quiz/` is the reference: `QuizEngine.tsx`, `registry.tsx`, `types.ts`, `use-quiz-session.ts`, `use-option-choice.ts`, `use-question-feedback.ts` (`CORRECT_HOLD_MS = 1200`, `RETRY_HOLD_MS = 600`), `OptionCard.tsx`, `McqQuestion.tsx`, `PictureSelectQuestion.tsx`, `ProgressFruit.tsx`, `QuizScoreScreen.tsx`, and `apps/web/features/lesson/steps/QuizStep.tsx`. `use-quiz-session.ts` holds a pure reducer (`quizSessionReducer`, `initialQuizSession`, `isQuizSessionFinished`) beside its hook. Grading is not in `apps/web` at all: `evaluateAnswer` lives in `packages/types/src/quiz/evaluate.ts`, and client-side evaluation is **instant feedback only**.
- M13 gives the step contract and the `quiz` placeholder this file replaces. M14 gives prompt audio and feedback sounds. M16 established the engine/registry/renderer split — follow the same shape so the two engines read alike.
- design.md §7 and §10: ≥64px targets, ≥20px text, feedback never colour-only, kid copy 1–4 words with an icon, and no scolding for a wrong answer.

## Detailed Requirements

1. **`components/quiz/QuizEngine.tsx`** — props as web's `QuizEngineProps` (`{ quizId, questions: { id, definition: unknown }[], locale, onFinish(records) }`); parses each question with `readQuizQuestion`, and owns:
   - the session: current index, recorded answers, per-question attempt count;
   - the prompt audio on each question's arrival plus a ≥64px replay speaker;
   - the feedback beat after each answer (correct sound + tick, or try-again sound + gentle wiggle);
   - the progress indicator across questions;
   - advancing to the next question, and calling `onFinish(records)` exactly once at the end.
   A question that fails to parse (or a format this binary does not render) is **skipped** (not fatal) and excluded from the client's count, so one bad payload cannot block a lesson. Log it with `console.error` as web does — it is a content incident and that is its only trace.
2. **Session logic, lifted.** Per D6, move `quizSessionReducer`, `initialQuizSession` and `isQuizSessionFinished` out of `apps/web/features/quiz/use-quiz-session.ts` into `packages/types/src/quiz/session.ts` (with tests), leaving web's hook as a thin wrapper that imports them. Mobile's `useQuizSession` wraps the same reducer.
3. **Answer evaluation, imported.** Call `evaluateAnswer(question, answer)` from `@kidlearn/types` — do not port a second copy. The server runs the same function against the stored `definition` when it grades the submission, so client and server cannot disagree. The client evaluates only to give **immediate feedback**; what is recorded is the server's verdict.
4. **Retry policy.** Match the web app's: there is **no fail state and no attempt limit** (spec §5.7). A wrong answer holds a short retry beat (`RETRY_HOLD_MS = 600`), marks the chosen option and lets the child try again; only the correct answer commits, after `CORRECT_HOLD_MS = 1200`. Carry `attempts` (every attempt, right or wrong, floor 1) into the record: the server stores `isCorrect` as *right on the first attempt*, and the reward grant, badges and weekly accuracy all read that. **Clamp `attempts` to 50 on the wire** — the schema rejects 51 with `400`, which would lose the whole quiz (web does not clamp today; see the note in M20).
5. **Renderer contract.** `components/quiz/quiz-props.ts`, mirroring web `QuestionProps`: `{ definition, locale, feedback, onAttempt(answer, isCorrect), onCommit(answer) }`. Renderers draw one question type and nothing else — no audio, no advancing, no scoring.
6. **MCQ renderer** (`components/quiz/McqQuestion.tsx`) — the localised prompt at display size, then 3–4 option cards stacked (portrait) or in a 2×2 grid (landscape / tablet). Each option ≥64px tall with ≥20px text, tappable across its whole area. Correct/incorrect states carry an **icon plus** colour.
7. **Picture-select renderer** (`components/quiz/PictureSelectQuestion.tsx`) — 3–4 image options (`option.image.url`) in a grid via `expo-image`, prefetched before the question becomes interactive (a child must never tap a blank square). Each option ≥96px, labelled for a screen reader from `option.text` or `option.image.alt` in the active locale even where the visual is image-only.
8. **`OptionCard`** — one shared pressable used by both renderers: variants for `idle | selected | correct | incorrect`, press spring (reduced-motion aware), and the icon+colour double encoding.
9. **Progress indicator.** Port the fruit motif from `apps/web/features/quiz/ProgressFruit.tsx` so the two clients look like one product; states differ by shape as well as colour.
10. **Answer collection.** The engine accumulates web's `QuizAnswerRecord` — the wire `QuizResponseRecord` (`{ questionId, answer, attempts }`, **no `isCorrect`**) plus a local-only `isFirstAttemptCorrect` for the score screen's star/sparkle — and hands them to `onFinish`. `QuizStep` (this file) drops `isFirstAttemptCorrect` before anything reaches the wire; submission and the score screen are M20, so this file ends with the answers in hand and a placeholder score screen. A `null` `lesson.quiz` renders `ActivityUnavailable` (`quiz.empty`) with a skip; zero records (every question skipped) calls the step's `onComplete()` directly, without a score screen.
11. **Tests** (`QuizEngine.test.tsx`, `McqQuestion.test.tsx`, `PictureSelectQuestion.test.tsx`, `QuizStep.test.tsx`; the lifted reducer keeps its tests in `packages/types`): an unparseable question is skipped and logged; a `null` quiz and an all-skipped quiz both complete the step; prompt audio plays once per question and again on the speaker; a wrong answer allows unlimited retries and only the correct answer advances, after the feedback beat; `attempts` is clamped to 50; records carry no `isCorrect` on the wire; MCQ renders 3–4 options at ≥64px; picture options prefetch before becoming interactive; every option is announced by a screen reader with its label.

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
apps/mobile/components/quiz/use-quiz-session.ts         # wraps the lifted reducer
packages/types/src/quiz/session.ts                      # lifted from apps/web/features/quiz/use-quiz-session.ts (+ test)
apps/mobile/components/lesson/steps/QuizStep.tsx        # replaces M13's placeholder
apps/mobile/components/lesson/steps/QuizStep.test.tsx
```

Skip rather than fail on a bad question — the difference between one broken payload and a blocked lesson:

```tsx
const { playable, skipped } = useMemo(() => {
  const playable: { id: string; definition: QuizQuestionDefinition }[] = [];
  const skipped: { id: string; detail: unknown }[] = [];
  for (const question of questions) {
    const parsed = readQuizQuestion(question.definition);   // read path, never safeParseQuizQuestion
    if (parsed.success) playable.push({ id: question.id, definition: parsed.data });
    else skipped.push({ id: question.id, detail: parsed.error.issues });
  }
  return { playable, skipped };
}, [questions]);
// Each skipped question is console.error-ed once; an all-skipped quiz finishes with no records.
```

The reducer is web's, unchanged (`ATTEMPT { isCorrect }` bumps `attempts` and latches first-attempt correctness; `COMMIT { questionId, answer }` appends a record with `attempts = max(attempts, 1)`, advances and resets). Renderers report attempts and commits; the engine owns the feedback beat, so the renderers stay dumb.

The wire mapping in `QuizStep`:

```ts
const wire: QuizResponseRecord[] = records.map(({ questionId, answer, attempts }) => ({
  questionId,
  answer,
  attempts: Math.min(attempts, 50),   // QuizResponseRecordSchema caps it; a 400 would lose the quiz
}));
```

Prefetch picture options before enabling taps:

```tsx
const [ready, setReady] = useState(false);
useEffect(() => {
  void Image.prefetch(question.options.map((o) => o.image.url)).then(() => setReady(true));
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
2. Wire `evaluateAnswer` and `readQuizQuestion` from `@kidlearn/types`; spot-check against `packages/types/src/__fixtures__/quiz.ts`. (~15 min)
3. Lift the session reducer into `packages/types/src/quiz/session.ts`, re-point web's hook, run both suites; write mobile's thin `useQuizSession`. (~35 min)
4. Build `OptionCard` with its five states, icon+colour encoding and reduced-motion press. (~30 min)
5. Build `McqQuestion` (portrait stack, landscape grid) and its test. (~30 min)
6. Build `PictureSelectQuestion` with prefetch gating and its test. (~30 min)
7. Build `ProgressFruit` ported from the web motif. (~20 min)
8. Build `QuizEngine`: parse + skip, prompt audio + speaker, feedback beat, progress, answer accumulation, `onFinish`. Test each behaviour. (~50 min)
9. Replace M13's quiz placeholder with `QuizStep` (null quiz, all-skipped, wire mapping); walk a seeded lesson's quiz on a **physical device** in both orientations and both languages, with a deliberately malformed question in the payload. (~30 min)
10. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] Questions are parsed with `readQuizQuestion` at the boundary; an unparseable question is skipped and logged without blocking the lesson.
- [ ] A `null` or fully-unparseable quiz completes the step instead of trapping the child.
- [ ] The session reducer lives in `packages/types` and both clients use it; the web suite still passes.
- [ ] Wire records are `{ questionId, answer, attempts }` with `attempts` clamped to 1–50 and no `isCorrect`.
- [ ] Prompt audio plays once per question and is replayable from a ≥64px speaker.
- [ ] Retry behaviour (unlimited, correct-only advance) and feedback timing match the web app's values.
- [ ] Correct/incorrect states are encoded by icon **and** colour, and read correctly in greyscale.
- [ ] MCQ options are ≥64px with ≥20px text; picture options are ≥96px and prefetched before becoming tappable.
- [ ] The progress indicator matches the web app's fruit motif and distinguishes states by shape.
- [ ] Grading comes from `evaluateAnswer` in `@kidlearn/types`; no local copy of the rules exists.
- [ ] The engine hands a complete set of answer records to `onFinish` exactly once; nothing is submitted yet.
- [ ] Every option is announced with its localised label by TalkBack and VoiceOver.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- `match_pair` and `drag_answer` renderers, submission to `POST /api/progress/quizzes/:quizId/responses`, and the real score screen — all M20.
- The reward step — M21.
- Client-side scoring as the recorded truth. The client evaluates for feedback only; the stored verdict and score are the server's.
- Adaptive difficulty or question shuffling. Not in the spec, and a shuffled order would break the server's per-question response records.
- Authoring quiz payloads — the admin CMS (`apps/web/features/admin/`) and the AI pipeline (`apps/server/src/modules/admin/ai/`), both web-only (D1).
