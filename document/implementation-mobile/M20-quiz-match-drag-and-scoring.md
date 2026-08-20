# M20 — Quiz Match-Pair, Drag-Answer & Scoring

> **Estimated effort:** 3–4 hours
> **Depends on:** M19, M18
> **Requirement IDs:** FR-QUIZ-02, FR-QUIZ-03, FR-QUIZ-06, FR-QUIZ-08
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Finish the quiz: the two remaining question renderers (match-pair and drag-answer), submission of the child's answers to the server, and the score screen that shows **the server's** score rather than a locally computed one.

## Context & Current State

- `MatchPairQuestionSchema` — `leftColumn` (2–6 `QuizOptionSchema`) plus its right column and the correct pairing. Interaction is tap-to-select / tap-to-pair, the same shape as M18's match activity but a **different schema and grader** — do not share the renderer, share the interaction pattern.
- `DragAnswerQuestionSchema` — the prompt "carries exactly one `{blank}` token per locale — the drop position". So the renderer must split the localised prompt on `{blank}`, render the two text runs with a drop zone between them, and accept a dragged option into it. The single-token guarantee comes from the schema; rely on it, but render defensively if a locale string somehow lacks the token (fall back to a drop zone after the text rather than crashing).
- `POST /api/progress/quizzes/:quizId/responses` — body per `QuizResponsesBodySchema`, answers as `QuizResponseRecord`s. Returns `QuizScoreSchema`: `{ lessonId, score (0–100), correctCount, totalQuestions }`.
- **The score is server-authoritative** (spec §7.3, FR-QUIZ-06). The client's own evaluation exists only for immediate feedback. If the two ever disagree, the server's number is what the child and the parent see.
- This endpoint is **not** screen-time gated (only content *starts* are), so a child finishing a quiz at the moment their limit expires still gets their score recorded.
- M19 gives the engine, the session reducer, the evaluator, `OptionCard`, the registry and the renderer contract (`{ question, locale, disabled, onAnswer, selected }`). M16/M18 give the gesture machinery (`use-drop-targets`) and the pairing state machine — both are reusable here as *patterns*, and `use-drop-targets` is reusable as *code*.
- `apps/web/components/quiz/MatchPairQuestion.tsx`, `DragAnswerQuestion.tsx`, `use-drag-answer.ts` and `QuizScoreScreen.tsx` are the references.

## Detailed Requirements

1. **Match-pair renderer** (`components/quiz/MatchPairQuestion.tsx`) — two columns, tap-to-select then tap-to-pair, matched pairs marked by colour **and** shape (reuse `pair-markers.ts` from M18), all pairs required before the answer is complete. `onAnswer` receives the full pairing as the question's `QuizAnswerValue`. A wrong pair follows the engine's retry policy rather than being rejected silently.
2. **Drag-answer renderer** (`components/quiz/DragAnswerQuestion.tsx`) — the localised prompt split on `{blank}`, a drop zone inline between the two runs, and the answer options in a tray below. Dragging an option into the zone sets the answer; the zone shows the placed option and can be changed before confirming. Reuse M16's `use-drop-targets` for hit-testing.
3. **Drag-answer, tap fallback — not just for screen readers.** A single inline drop zone is fiddly on a small phone, so make tap-to-select-then-tap-the-blank a **first-class** interaction for everyone, with the drag as the alternative. This is a deliberate divergence from the web app's mouse-first design, and the right call on a 360px screen; note it in a comment.
4. **Text layout with an inline drop zone.** The prompt must wrap naturally with the blank inside the flow — implement with nested `<Text>` runs and a measured inline `View`, not by assuming the blank sits at the end of a line. Verify with a long Bengali prompt, which wraps very differently from the English one.
5. **Submission.** On `onComplete(responses)` from the engine, `POST /api/progress/quizzes/:quizId/responses` with the accumulated records. Show a short celebratory waiting state, not a spinner. On failure: retry once, and if it still fails, show the locally computed score **clearly labelled as provisional** and continue to the reward step — a network problem must not cost a child their reward. The server reconciles when the lesson-completion call lands (M13 already handles that call).
6. **Score screen** (`components/quiz/QuizScoreScreen.tsx`) — from `QuizScoreSchema`: a big friendly figure (stars proportional to `score`, plus `correctCount`/`totalQuestions` as icons rather than a fraction a pre-reader cannot read), the mascot, and one large "next" button into the reward step. Encourage at every level: there is no failing score on this surface (design.md §10). Show the actual number for the parent's benefit at small size, never as the headline.
7. **Answer records are complete and honest.** Every answered question produces a record, including ones the child got wrong after the retry limit (FR-QUIZ-08 — the response history is what makes the dashboard meaningful). Skipped/unparseable questions produce no record and are excluded from the total.
8. **Reduced motion and a11y.** Pairing and dragging both have non-animated feedback paths; both renderers are completable with a screen reader active via the tap flows; every option announces its localised label and its state.
9. **Both orientations, smallest screen.** Six-pair match-pair must fit a 360px-wide phone with ≥64px targets (two columns, tight spacing before small targets). Drag-answer's tray must not scroll horizontally under a pan gesture.
10. **Tests** (`MatchPairQuestion.test.tsx`, `DragAnswerQuestion.test.tsx`, `QuizScoreScreen.test.tsx`, plus submission tests): pairing all pairs produces the expected answer value; a partial pairing does not complete the question; drag-answer accepts an option by drag **and** by tap-tap, and the placed option can be replaced; a prompt without `{blank}` still renders a usable drop zone; submission posts the accumulated records once; a failed submission (after retry) shows the provisional score and still advances; the score screen renders from `QuizScoreSchema` and never displays a failure framing.

## Technical Approach & Suggestions

```
apps/mobile/components/quiz/MatchPairQuestion.tsx
apps/mobile/components/quiz/MatchPairQuestion.test.tsx
apps/mobile/components/quiz/DragAnswerQuestion.tsx
apps/mobile/components/quiz/DragAnswerQuestion.test.tsx
apps/mobile/components/quiz/QuizScoreScreen.tsx
apps/mobile/components/quiz/QuizScoreScreen.test.tsx
apps/mobile/lib/quiz-api.ts                      # submitQuizResponses(quizId, records)
apps/mobile/lib/quiz-api.test.ts
apps/mobile/lib/prompt-blank.ts                  # split a localised prompt on {blank}
apps/mobile/lib/prompt-blank.test.ts
apps/mobile/components/quiz/registry.tsx         # + match_pair, drag_answer
```

Splitting the prompt, defensively despite the schema's guarantee:

```ts
// apps/mobile/lib/prompt-blank.ts
const BLANK = "{blank}";

/**
 * `DragAnswerQuestionSchema` guarantees exactly one token per locale, so the
 * happy path is a two-part split. The fallback exists because a renderer that
 * crashes on unexpected content is worse than one that puts the blank last.
 */
export function splitPrompt(text: string): { before: string; after: string } {
  const at = text.indexOf(BLANK);
  if (at === -1) return { before: text, after: "" };
  return { before: text.slice(0, at), after: text.slice(at + BLANK.length) };
}
```

The inline blank, wrapping with the text rather than beside it:

```tsx
<Text variant="title">
  {before}
  <Text
    onLayout={registerDropZone("blank")}
    accessibilityLabel={t("lesson:blankLabel")}
    className={cn("rounded-xl px-4 py-1", placed ? "bg-primary/20" : "border-2 border-dashed border-input")}
  >
    {placed ? localizedLabel(placed.label, locale) : "     "}
  </Text>
  {after}
</Text>
```

Submission with one retry and a graceful degradation — the reward must not be hostage to the network:

```ts
async function submit(records: QuizResponseRecord[]) {
  let result = await submitQuizResponses(quizId, records);
  if (!result.ok) result = await submitQuizResponses(quizId, records);

  if (result.ok) return { score: result.data, provisional: false };

  // The server reconciles on lesson completion; a child does not lose a reward
  // to a dropped request. Labelled provisional so nobody treats it as recorded.
  return { score: localScore(records), provisional: true };
}
```

Reuse M18's `pair-markers.ts` for match-pair rather than a second colour list — one pair colour/shape vocabulary across the whole app is what keeps a matched pair meaning the same thing in both a quiz and an activity.

For the score screen, express `score` as filled stars (e.g. out of five) plus `correctCount` ticks. A percentage is for the parent dashboard; a pre-reader reads shapes.

## Step-by-Step Plan

1. Write `lib/prompt-blank.ts` with tests (token present, absent, at the start, at the end). (~20 min)
2. Build `MatchPairQuestion` reusing M18's pairing pattern and `pair-markers.ts`; test full pairing, partial pairing and the wrong-pair path. (~45 min)
3. Build `DragAnswerQuestion` with the inline blank, the drag path (via `use-drop-targets`) and the tap-tap path; test both and the replaceable placement. (~55 min)
4. Register both types in the quiz registry and confirm a seeded quiz containing all four types walks end to end. (~15 min)
5. Write `lib/quiz-api.ts` (`submitQuizResponses`) with its test; wire submission into the engine's completion with the celebratory waiting state. (~30 min)
6. Add the failure path: one retry, then the provisional score, then advance. Test it. (~25 min)
7. Build `QuizScoreScreen` from `QuizScoreSchema` (stars + ticks, small numeric, encouraging at every level) and its test. (~35 min)
8. Device pass on a **physical phone**: a six-pair match, a long Bengali drag-answer prompt (check the wrap), both orientations, screen reader on, and airplane mode at the moment of submission to see the provisional path. (~35 min)
9. `pnpm lint && pnpm typecheck && pnpm --filter mobile test`; commit; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] All four question types render and are completable on a physical device in both languages and orientations.
- [ ] Match-pair requires every pair, marks pairs by colour **and** shape, and reuses M18's marker vocabulary.
- [ ] Drag-answer places an option by drag **and** by tap-tap; the placed option can be replaced before confirming.
- [ ] A long Bengali drag-answer prompt wraps correctly with the blank inline, not pushed to the end of the text.
- [ ] A prompt missing its `{blank}` token still renders a usable question.
- [ ] Answers are submitted once to `POST /api/progress/quizzes/:quizId/responses`, including wrong answers after the retry limit.
- [ ] A failed submission retries once, then shows a clearly provisional score and still advances to the reward step — no child loses a reward to a dropped request.
- [ ] The score screen renders from `QuizScoreSchema`; the client's own evaluation is never presented as the recorded score.
- [ ] The score screen encourages at every level, with stars and ticks as the headline and the numeric score small.
- [ ] Both renderers are completable with a screen reader active, with localised labels and state announcements.
- [ ] Six pairs fit a 360px-wide screen with ≥64px targets; the drag-answer tray does not scroll horizontally.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm --filter mobile test` pass.

## Out of Scope

- The reward step's stars, coins, badges and streak celebration — M21 (this file ends at the score screen's "next").
- Recomputing or overriding the server's score on the client.
- Question shuffling or adaptive difficulty. Not in the spec, and shuffling would break per-question response records.
- Quiz authoring — the CMS (web file 33) and the AI generator (web file 35).
- A parent-facing per-question breakdown. FR-QUIZ-08's records feed the dashboard; the drill-down UI is a Phase 2 item on the web side.
