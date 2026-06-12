# 22 — Quiz Match-Pair, Drag-Answer & Scoring

> **Estimated effort:** 3–4 hours
> **Depends on:** 21
> **Requirement IDs:** FR-QUIZ-02, FR-QUIZ-03, FR-QUIZ-06, FR-QUIZ-08
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Complete the quiz system: ship the two remaining question formats — `MatchPairQuestion` (FR-QUIZ-02, tap-tap pairing reusing file 20's `usePairing` hook) and `DragAnswerQuestion` (FR-QUIZ-03, drag the correct option into a `{blank}` slot using `@dnd-kit/core`) — then close the loop after the last question: POST the per-question `QuizAnswerRecord[]` to a new server endpoint that stores `QuizResponse` rows (FR-QUIZ-08) and writes the quiz score onto `LessonProgress`, and show the child a friendly stars-out-of-N score screen (FR-QUIZ-06) before advancing to the reward step. Reward *granting* is file 23; this file ends with the score screen calling `onComplete`.

## Context & Current State

File 21 is done: `QuizEngine` runs questions one at a time with the fruit-dot progress strip, `useQuizSession` accumulates `QuizAnswerRecord[]` (`{questionId, answer, isCorrect, attempts}` — `isCorrect` = first attempt correct, `attempts` ≥ 1), `useQuestionFeedback` provides the shared cheer/dim/lock layer, `evaluateAnswer` throws for `drag_answer`/`match_pair` (the cases land here), and the registry maps `mcq`/`picture_select`. `QuizStep` currently wires `onFinish` straight to `onComplete`. From file 20, `components/activities/usePairing.ts` exists and was deliberately kept activity-agnostic (callbacks only — built for reuse here). From file 18, `@dnd-kit/core` is installed with tuned `PointerSensor`/`TouchSensor`. From file 16, `apps/server/src/routes/progress.ts` is mounted at `/api/progress` behind the active-child session middleware, and `apps/web/lib/progress-api.ts` holds the client wrappers. From file 06, the `QuizResponse` model exists (`childId`, `questionId`, `answer Json`, `isCorrect`, `answeredAt`) — note it has **no `attempts` column yet**; this file adds it additively. From file 07, `MatchPairQuestionSchema` has `leftSet`/`rightSet`/`correctPairs` and `DragAnswerQuestionSchema` has a `sentence: LocalizedText` with exactly one `{blank}` token, `options[]`, `correctOptionId`.

## Detailed Requirements

1. **FR-QUIZ-02 — MatchPairQuestion:** `leftSet`/`rightSet` render as two columns (portrait) / two rows (landscape) of large cards (≥ 96px square), reusing the tap-tap interaction and pastel pair-color locking from file 20's `MatchActivity` via the shared `usePairing` hook — do **not** duplicate the pairing state machine. Wrong pair → both cards wiggle, encouraging audio via `feedback`, selection clears; correct pair → lock + line/color confirmation. No fail state, infinite retries.
2. **Attempt semantics for pair questions (binding, fits the file-21 reducer unchanged):** each *wrong* pair fires `onAttempt(partialAnswer, false)`; correct pair placements mid-question fire nothing; when **all** pairs are matched, fire `onAttempt(finalAnswer, true)` then `onCommit(finalAnswer)` where `finalAnswer = { pairs: [{leftId, rightId}, …] }`. Result: a clean run yields `attempts: 1, isCorrect: true`; any wrong pair yields `isCorrect: false` with `attempts = wrongPairs + 1`.
3. **FR-QUIZ-03 — DragAnswerQuestion:** the sentence renders as large text split around the `{blank}` token, with the blank as a clearly-outlined drop slot (≥ 96×96px); 3–4 option cards sit in a tray below. Dragging the correct option into the slot → it locks in, the completed sentence is read aloud (`promptAudio` replay), cheer, then `onCommit(optionId)`. A wrong option → snaps back to the tray, dims to 40% (disabled), encouraging audio, `onAttempt(optionId, false)`. Same dnd-kit sensors as file 18.
4. **`evaluateAnswer` completed:** the `match_pair` and `drag_answer` cases replace the file-21 `throw`s. `drag_answer`: `answer === question.correctOptionId`. `match_pair`: answer is the `{ pairs }` shape — true iff every submitted pair is in `correctPairs` (order-agnostic per pair) and all pairs are present.
5. **FR-QUIZ-08 — response submission endpoint:** `POST /api/progress/quizzes/:quizId/responses` (contract below) validates with a Zod schema from `packages/types`, scopes everything to the active child (401 without one), 404s if the quiz isn't visible to the child (unpublished or wrong grade — same visibility rule as file 12), 400s if any `questionId` doesn't belong to the quiz, then inserts one `QuizResponse` row per record with server-side `answeredAt`. Add `attempts Int @default(1)` to `QuizResponse` (additive migration).
6. **Scoring onto `LessonProgress`:** the endpoint computes `score = Math.round(100 * correctCount / totalQuestions)` from the submitted records (`isCorrect` count) and upserts it onto the `LessonProgress` row for the quiz's lesson — **never lowering** an existing score (replays keep the child's best).
7. **FR-QUIZ-06 — score screen:** after `onFinish`, `QuizStep` submits the records, then renders `QuizScoreScreen`: one big star per question, filled (pop-in animation, stagger) for each first-try-correct answer, soft sparkle outlines for the rest — **never** empty grey stars, red marks, percentages, or grades. Mascot praise audio always plays (one pool regardless of score). A big "Yay!" button calls `onComplete` to advance to the reward step.
8. **Submission must never trap the child:** the score screen renders from the **local** records immediately; the POST runs alongside (await with a short timeout, then proceed). On failure, log to console and continue — the celebration and lesson flow are never blocked by the network.
9. **Tests:** Supertest for the endpoint (validation, child scoping, visibility, score write, best-score-kept); RTL component tests for both new formats; unit tests for the two new `evaluateAnswer` cases.

## Technical Approach & Suggestions

Files to create:

```
apps/web/components/quiz/MatchPairQuestion.tsx
apps/web/components/quiz/DragAnswerQuestion.tsx
apps/web/components/quiz/QuizScoreScreen.tsx
apps/web/components/quiz/MatchPairQuestion.test.tsx
apps/web/components/quiz/DragAnswerQuestion.test.tsx
apps/web/components/quiz/QuizScoreScreen.test.tsx
```

Files to modify:

```
apps/web/components/quiz/evaluateAnswer.ts        # + match_pair, drag_answer cases
apps/web/components/quiz/evaluateAnswer.test.ts   # + tests for both
apps/web/components/quiz/registry.ts              # register the two new formats
apps/web/components/lesson/QuizStep.tsx           # onFinish → submit → score screen → onComplete
apps/web/lib/progress-api.ts                      # + submitQuizResponses()
apps/server/src/routes/progress.ts                # + POST /api/progress/quizzes/:quizId/responses
apps/server/src/routes/progress.test.ts           # + endpoint specs
packages/types/src/progress.ts                    # + quizResponsesSubmitSchema
packages/db/prisma/schema.prisma                  # QuizResponse + attempts Int @default(1)
```

Zod contract (`packages/types/src/progress.ts` — single source for client + server):

```ts
export const quizAnswerValueSchema = z.union([
  z.string().min(1), // chosen optionId (mcq, picture_select, drag_answer)
  z.object({ pairs: z.array(z.object({ leftId: z.string().min(1), rightId: z.string().min(1) })).min(1) }),
]);

export const quizResponseRecordSchema = z.object({
  questionId: z.string().min(1),
  answer: quizAnswerValueSchema,   // final committed (correct) answer
  isCorrect: z.boolean(),          // first attempt correct (file 21 semantics)
  attempts: z.number().int().min(1).max(50),
});

export const quizResponsesSubmitSchema = z.object({
  responses: z.array(quizResponseRecordSchema).min(1).max(10),
});
export type QuizResponsesSubmit = z.infer<typeof quizResponsesSubmitSchema>;
```

Endpoint contract (envelope per file 08):

```
POST /api/progress/quizzes/:quizId/responses
Body:     { responses: QuizResponseRecord[] }
200:      { data: { lessonId: string, score: number, correctCount: number, totalQuestions: number } }
401:      no active child session   404: quiz not visible to child   400: VALIDATION_FAILED (bad shape or foreign questionId)
```

Server handler sketch (in `routes/progress.ts`, after `validate({ body: quizResponsesSubmitSchema })`):

```ts
const quiz = await prisma.quiz.findFirst({
  where: { id: req.params.quizId, /* published + grade visibility, same helper as file 12 */ },
  include: { questions: { select: { id: true } }, lesson: { select: { id: true } } },
});
if (!quiz) throw ApiError.notFound("Quiz not found");
const known = new Set(quiz.questions.map((q) => q.id));
if (!body.responses.every((r) => known.has(r.questionId)))
  throw new ApiError(400, "VALIDATION_FAILED", "questionId does not belong to this quiz");

await prisma.quizResponse.createMany({
  data: body.responses.map((r) => ({
    childId, questionId: r.questionId, answer: r.answer as Prisma.InputJsonValue,
    isCorrect: r.isCorrect, attempts: r.attempts,
  })),
});
const correctCount = body.responses.filter((r) => r.isCorrect).length;
const score = Math.round((100 * correctCount) / quiz.questions.length);
const existing = await prisma.lessonProgress.findUnique({
  where: { childId_lessonId: { childId, lessonId: quiz.lesson.id } },
});
await prisma.lessonProgress.upsert({
  where: { childId_lessonId: { childId, lessonId: quiz.lesson.id } },
  create: { childId, lessonId: quiz.lesson.id, score },
  update: { score: Math.max(existing?.score ?? 0, score) }, // best score kept
});
res.json({ data: { lessonId: quiz.lesson.id, score, correctCount, totalQuestions: quiz.questions.length } });
```

`evaluateAnswer` new cases (pure):

```ts
case "drag_answer":
  return answer === question.correctOptionId;
case "match_pair": {
  if (typeof answer === "string") return false;
  const key = (l: string, r: string) => `${l}::${r}`;
  const correct = new Set(question.correctPairs.map((p) => key(p.leftId, p.rightId)));
  return (
    answer.pairs.length === question.correctPairs.length &&
    answer.pairs.every((p) => correct.has(key(p.leftId, p.rightId)) || correct.has(key(p.rightId, p.leftId)))
  );
}
```

`MatchPairQuestion` wires `usePairing` (from `components/activities/usePairing.ts`) with: `isCorrectPair: (a, b) => question.correctPairs.some(...)` (order-agnostic), `onWrong` → `feedback.wrong()` + `onAttempt({ pairs: matchedSoFar }, false)`, `onAllMatched` → build `finalAnswer` from the `matched` map, `onAttempt(finalAnswer, true)`, then `onCommit(finalAnswer)` after the feedback lock window. Reuse the pastel pair-color highlight; the SVG connecting line is optional here (columns are adjacent) — locked color pairs suffice.

`DragAnswerQuestion`: local `DndContext` with file 18's sensor config; the blank is `useDroppable({ id: "blank" })` rendered inline in the sentence (`text-3xl`, slot `min-w-28 min-h-14 rounded-2xl border-4 border-dashed`); each option `useDraggable({ id: option.id, disabled: dimmed.has(option.id) })`. `handleDragEnd`: `over?.id === "blank"` → `evaluateAnswer(question, String(active.id))` → correct: lock + `feedback.correct()` + `onCommit` after 1200ms; wrong: `feedback.wrong()` + add to `dimmed` + `onAttempt(id, false)`. Split the sentence with `prompt`-locale `sentence[locale].split("{blank}")`.

`QuizScoreScreen` props: `{ records: QuizAnswerRecord[]; locale: Locale; onDone: () => void }` — stars derived from `records`, no server data needed. Use `motion`/CSS stagger for the star pop-ins and the existing cheer audio pool.

## Step-by-Step Plan

1. Write failing `evaluateAnswer` tests for `drag_answer` (correct id true, wrong false) and `match_pair` (all pairs either order true, missing pair false, wrong pair false, string answer false) with file-07 fixtures; implement both cases → green. (~20 min)
2. Add `quizResponsesSubmitSchema` to `packages/types/src/progress.ts` with schema unit tests (valid records, attempts 0 rejected, > 10 responses rejected); add `attempts Int @default(1)` to `QuizResponse` and run the additive migration (`quiz_response_attempts`). (~20 min)
3. Write failing Supertest specs: 401 without active child; 404 for unpublished/foreign-grade quiz; 400 for a `questionId` from another quiz; happy path inserts N `QuizResponse` rows for the active child and writes `score` to the lesson's `LessonProgress`; resubmitting a lower score keeps the higher one. (~30 min)
4. Implement the endpoint in `routes/progress.ts` → green. (~25 min)
5. Write failing `MatchPairQuestion.test.tsx` (wrong pair fires `onAttempt(_, false)` + clears selection; matching all pairs fires `onAttempt(final, true)` then `onCommit(final)` once); implement using `usePairing`. (~35 min)
6. Write failing `DragAnswerQuestion.test.tsx` (drive `handleDragEnd` via hook extraction per file 18's pattern: wrong option dims + retry; correct locks + commits); implement with dnd-kit. (~35 min)
7. Build `QuizScoreScreen` (+ test: 3 records with 2 correct renders 2 filled stars + sparkles, button fires `onDone`; 0 correct still celebrates); register both formats in `registry.ts`. (~25 min)
8. Rewire `QuizStep.tsx`: `onFinish` → render score screen immediately + `submitQuizResponses(quizId, records)` fire-alongside (failure logged, never blocks); `onDone` → `onComplete`. Manual run of a 4-format quiz in `pnpm dev` (portrait + landscape, touch emulation); `pnpm lint && pnpm typecheck && pnpm --filter web test && pnpm --filter server test`; update tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter web test` passes including the extended `evaluateAnswer` cases, `MatchPairQuestion.test.tsx`, `DragAnswerQuestion.test.tsx`, and `QuizScoreScreen.test.tsx`.
- [ ] `pnpm --filter server test` passes the new endpoint specs: 401 / 404 / 400 envelopes, rows stored under the active child only, score written, best score kept on resubmit.
- [ ] All four quiz formats render through `QuizEngine` from JSON fixtures — no `throw` remains in `evaluateAnswer`.
- [ ] A clean match-pair run records `{isCorrect: true, attempts: 1}`; one wrong pair then finishing records `{isCorrect: false, attempts: 2}` (verify in the submitted payload).
- [ ] `POST /api/progress/quizzes/:quizId/responses` with a 4-question payload creates 4 `QuizResponse` rows (with `attempts`) and sets `LessonProgress.score` to the expected rounded percentage (FR-QUIZ-08).
- [ ] The score screen shows filled stars for first-try-correct answers only, never shows numbers/percentages/red marks, plays praise audio even at 0 correct, and its button advances to the reward step (FR-QUIZ-06).
- [ ] Killing the server while finishing a quiz still shows the score screen and advances (console error only).
- [ ] Match cards and the drag-answer blank slot are ≥ 96px touch targets in portrait and landscape.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Granting stars/coins from the score and the `POST /lessons/:id/complete` endpoint — file 23 (this file only writes `QuizResponse` + `LessonProgress.score`).
- The reward celebration screen (23) and badge/streak side effects of quiz accuracy (24).
- Parent-dashboard accuracy queries reading `QuizResponse` (29) and weekly reports (30).
- AI quiz generation (35) and admin quiz editing (33).
