# M20 — Quiz Match-Pair, Drag-Answer & Scoring

> **Estimated effort:** 3–4 hours
> **Depends on:** M19, M18
> **Requirement IDs:** FR-QUIZ-02, FR-QUIZ-03, FR-QUIZ-06, FR-QUIZ-08
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Finish the quiz: the two remaining question renderers (match-pair and drag-answer), a one-shot submission of the child's answers that the lesson's completion waits for, and the score screen — a star or sparkle per question, never a number a pre-reader cannot read.

## Context & Current State

- `MatchPairQuestionSchema` — `leftColumn` / `rightColumn` (2–6 options each, each needing `text` or `image`) and `correctPairs` (`{ leftId, rightId }`). Interaction is tap-to-select / tap-to-pair, the same shape as M18's match activity but a **different schema and grader** — web's `MatchPairQuestion.tsx` reuses the shared `use-pairing` hook and nothing else; do the same. Each wrong pair is an attempt (`onAttempt({ pairs: [wrongPair] }, false)`); when every pair is matched, the full answer is attempted as correct and committed after the correct beat. So a question with any wrong pair is recorded with `attempts > 1`.
- `DragAnswerQuestionSchema` — `prompt` and `promptAudio` like every question, plus a **`sentence`** that "carries exactly one `{blank}` token per locale — the drop position", `options` (2–4) and `correctOptionId`. The renderer splits `sentence[locale]` on `{blank}` (web's `splitAtBlank` in `use-drag-answer.ts`: `split("{blank}")`, `after` defaulting to `""`) and renders the two runs with a drop zone between them. The single-token guarantee comes from the schema; render defensively anyway (a missing token puts the zone after the text).
- Web's `DragAnswerQuestion.tsx` already offers **both** paths: dnd-kit drag (`use-activity-sensors`) and tap-to-place (`apps/web/shared/hooks/use-tap-to-place.ts`), with spoken drag announcements. Mobile mirrors both.
- `POST /api/progress/quizzes/:quizId/responses` — `{ responses: QuizResponseRecord[] }`: 1–10 records, unique `questionId`s, each `{ questionId, answer, attempts (1–50) }`; `answer` is an option id string, or `{ pairs: [{ leftId, rightId }] }` for `match_pair`. **There is no `isCorrect` field** — the server grades `answer` against the stored `definition` with `evaluateAnswer` (`packages/types/src/quiz/evaluate.ts`) and stores `isCorrect = attempts === 1 && evaluateAnswer(...)`. It answers `QuizScoreSchema` `{ lessonId, score (0–100), correctCount, totalQuestions }`, where `score = round(100 × correctCount / totalQuestions)` over **all** the quiz's stored questions (including any the client skipped as unparseable). A `questionId` not in the quiz is `400 VALIDATION_FAILED`; a replay keeps the best score on the progress row.
- **The write is not idempotent.** Each call `createMany`s response rows, so a retry after a dropped reply stores the answers twice. Web sends it with `retries: 0` and no manual retry. `QUIZ_RESPONSES_PER_MINUTE = 30` counts stored **response rows** per child per rolling minute → `429 RATE_LIMITED`; a 10-question quiz replayed three times inside a minute hits it.
- **`attempts` is capped at 50 by the schema.** A child who taps a question 51 times gets the whole submission refused with `400`. Web's `QuizStep` does not clamp today (a web bug to fix separately); mobile clamps to 50 on the wire — still `attempts > 1`, so still graded as not first-try.
- Screen time: the submission is held to the start decision (`423`) only when it would *create* the progress row; in practice the row exists from the first step report.
- Web's flow (`apps/web/features/lesson/steps/QuizStep.tsx` + `QuizScoreScreen.tsx`): on finish, map records to the wire (dropping `isFirstAttemptCorrect`), add the submission to the run's `pendingWrites` (so the reward step's completion waits for it — the server derives the quiz star and per-answer coins from **stored** responses), and show the score screen at once from the local records — a filled star for each first-try answer, a sparkle otherwise, an announced line in words rather than a count, and one "done" button. The server's `QuizScore` response is not displayed; a failure is logged, invisible to the child.
- M19 gives the engine, the lifted session reducer, `OptionCard`, the registry, the renderer contract (`{ definition, locale, feedback, onAttempt, onCommit }`) and `QuizStep`. M16/M18 give `use-drop-targets`, `use-tap-to-place` and `use-pairing`.

## Detailed Requirements

1. **Match-pair renderer** (`components/quiz/MatchPairQuestion.tsx`) — two columns, tap-to-select then tap-to-pair via `use-pairing` with `isCorrectPair` reading `correctPairs`, matched pairs marked with the line/tick and M18's colour-and-shape markers. Wrong pairs are attempts as described above; the full `{ pairs }` answer commits only when every pair is matched.
2. **Drag-answer renderer** (`components/quiz/DragAnswerQuestion.tsx`) — the localised `sentence` split on `{blank}`, a drop zone inline between the two runs, and the options in a tray below. Dragging an option into the zone (M16's `use-drop-targets`) or tapping an option then the blank (`use-tap-to-place`) attempts it: correct → commit after the beat; wrong → retry beat, the option returns to the tray **dimmed** and cannot be tried again (web's `dimmedIds`).
3. **Text layout with an inline drop zone.** The sentence must wrap naturally with the blank inside the flow — nested `<Text>` runs and a measured inline `View`, not an assumption that the blank sits at the end of a line. Verify with a long Bengali sentence, which wraps very differently from the English one.
4. **Submission — once, queued, never retried.** In `QuizStep`, when the engine finishes with at least one record: map to the wire (`attempts` clamped to 50 — see M19), and `pendingWrites.add(() => submitQuizResponses(quiz.id, wire))` with `retries: 0` in `apiFetch`. Do not await it before showing the score, do not retry it, and do not "keep trying in the background": a duplicate stores the answers twice and spends the per-minute budget. A failure (including `429` or `400`) is logged; the child sees nothing, and completion simply pays without the quiz star — there is no later reconciliation.
5. **Score screen** (`components/quiz/QuizScoreScreen.tsx`) — mirror web: from the local records, a star for each `isFirstAttemptCorrect` and a sparkle otherwise (shape, not just colour), staggered in (`STAR_STAGGER_S = 0.08`, capped at `0.4`), a random cheer on mount, an announcement in words (`quiz.score.announce`) rather than "3 of 4", and one large "done" that calls the step's `onComplete()`. Encourage at every level: there is no failing score on this surface (design.md §10). The local derivation is the same rule the server applies with the same `evaluateAnswer`, so the stars are not a second source of truth — they are feedback, and the recorded verdict stays the server's.
6. **Answer records are complete and honest.** Every answered question produces a record with its real `attempts` (FR-QUIZ-08 — the response history is what makes the dashboard meaningful). Skipped/unparseable questions produce no record.
7. **Reduced motion and a11y.** Pairing and dragging both have non-animated feedback paths; both renderers are completable with a screen reader via the tap flows; every option announces its localised label and its state; drag-answer announces pick-up, hover and drop as web does.
8. **Both orientations, smallest screen.** Six-pair match-pair must fit a 360px-wide phone with ≥64px targets (two columns, tight spacing before small targets). Drag-answer's tray must not scroll horizontally under a pan gesture.
9. **Tests** (`MatchPairQuestion.test.tsx`, `DragAnswerQuestion.test.tsx`, `QuizScoreScreen.test.tsx`, `QuizStep.test.tsx` additions): a wrong pair is an attempt and a full pairing commits `{ pairs }`; a partial pairing does not complete the question; drag-answer accepts an option by drag **and** by tap-tap, and a wrong one returns to the tray dimmed and unplaceable; a sentence without `{blank}` still renders a usable drop zone; submission is queued on `pendingWrites` exactly once with `retries: 0` and no `isCorrect`; a failed submission is not retried and the step still advances; the score screen shows a star per first-try answer and a sparkle otherwise and never displays a number or a failure framing.

## Technical Approach & Suggestions

```
apps/mobile/components/quiz/MatchPairQuestion.tsx
apps/mobile/components/quiz/MatchPairQuestion.test.tsx
apps/mobile/components/quiz/DragAnswerQuestion.tsx
apps/mobile/components/quiz/DragAnswerQuestion.test.tsx
apps/mobile/components/quiz/use-drag-answer.ts       # port: attempt/commit + splitAtBlank
apps/mobile/components/quiz/QuizScoreScreen.tsx
apps/mobile/components/quiz/QuizScoreScreen.test.tsx
apps/mobile/lib/progress-api.ts                      # + submitQuizResponses (retries: 0)
apps/mobile/components/quiz/registry.tsx             # + match_pair, drag_answer
```

The inline blank, wrapping with the text rather than beside it:

```tsx
const { before, after } = splitAtBlank(definition.sentence[locale]);

<Text variant="title">
  {before}
  <Text
    onLayout={registerDropZone("blank")}
    accessibilityLabel={t("lesson:quiz.drag.blank")}
    className={cn("rounded-xl px-4 py-1", placed ? "bg-primary/20" : "border-2 border-dashed border-input")}
  >
    {placed ? localizedLabel(placed.text, locale) : "     "}
  </Text>
  {after}
</Text>
```

Submission, exactly as web's `QuizStep` — queued, one-shot, never awaited by the child:

```ts
const handleFinish = (records: readonly QuizAnswerRecord[]) => {
  if (records.length === 0 || quizId === undefined) return onComplete();
  setFinishedRecords(records);                       // score screen renders now

  const wire = records.map(({ questionId, answer, attempts }) => ({
    questionId, answer, attempts: Math.min(attempts, 50),
  }));
  // Not idempotent (createMany): no retries, no background loop. Completion waits on the chain.
  pendingWrites.add(() =>
    submitQuizResponses(quizId, wire).then((r) => { if (!r.ok) console.warn(`quiz not recorded: ${r.error.code}`); }),
  );
};
```

Reuse M18's `pair-markers.ts` for match-pair rather than a second colour list — one pair vocabulary across the app keeps a matched pair meaning the same thing in a quiz and an activity.

## Step-by-Step Plan

1. Port `use-drag-answer.ts` (`splitAtBlank` and the attempt/commit flow) with tests (token present, absent, at the start, at the end). (~25 min)
2. Build `MatchPairQuestion` on `use-pairing` and `pair-markers.ts`; test full pairing, partial pairing and the wrong-pair attempt. (~45 min)
3. Build `DragAnswerQuestion` with the inline blank, the drag path (`use-drop-targets`) and tap-to-place; test both and the wrong-option dim. (~55 min)
4. Register both types in the quiz registry and confirm a seeded quiz containing all four types walks end to end. (~15 min)
5. Add `submitQuizResponses` and wire the queued one-shot submission into `QuizStep`; test the failure path (no retry, step still advances). (~25 min)
6. Build `QuizScoreScreen` (stars/sparkles, words not counts, reduced-motion static form) and its test. (~30 min)
7. Device pass on a **physical phone**: a six-pair match, a long Bengali drag-answer sentence (check the wrap), both orientations, screen reader on, and airplane mode at the moment of submission to see that the child is not held. (~35 min)
8. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] All four question types render and are completable on a physical device in both languages and orientations.
- [ ] Match-pair requires every pair, records each wrong pair as an attempt, and reuses M18's marker vocabulary.
- [ ] Drag-answer places an option by drag **and** by tap-tap, splitting `sentence` (not `prompt`) on `{blank}`.
- [ ] A long Bengali drag-answer sentence wraps correctly with the blank inline, not pushed to the end of the text.
- [ ] A sentence missing its `{blank}` token still renders a usable question.
- [ ] Answers are submitted once, with `retries: 0`, on the run's `pendingWrites` chain — including answers that took more than one attempt — with no `isCorrect` and `attempts` ≤ 50.
- [ ] A failed submission is not retried and never holds the child; the step advances and completion still runs.
- [ ] The score screen shows a star per first-try answer and a sparkle otherwise, announces in words, and never shows a number or a failure framing.
- [ ] Both renderers are completable with a screen reader active, with localised labels and state announcements.
- [ ] Six pairs fit a 360px-wide screen with ≥64px targets; the drag-answer tray does not scroll horizontally.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The reward step's stars, coins, badges and streak celebration — M21 (this file ends at the score screen's "done").
- Showing the server's `QuizScore` figure to the child, or recomputing it. It is recorded for the parent's reports.
- Question shuffling or adaptive difficulty. Not in the spec, and shuffling would break per-question response records.
- Quiz authoring — the admin CMS (`apps/web/features/admin/`) and the AI pipeline (`apps/server/src/modules/admin/ai/`), both web-only (D1).
- A parent-facing per-question breakdown. FR-QUIZ-08's records feed the dashboard; the drill-down UI is a Phase 2 item on the web side.
