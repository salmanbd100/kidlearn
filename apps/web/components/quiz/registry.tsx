"use client";

import type { QuizQuestionDefinition } from "@kidlearn/types";
import type { ReactNode } from "react";
import { DragAnswerQuestion } from "./DragAnswerQuestion";
import { MatchPairQuestion } from "./MatchPairQuestion";
import { McqQuestion } from "./McqQuestion";
import { PictureSelectQuestion } from "./PictureSelectQuestion";
import type { PlayableQuestion, QuestionProps } from "./types";

/**
 * Question format → renderer (FR-QUIZ-07).
 *
 * The same shape as `activities/registry.tsx`, for the same reasons: a `switch`
 * rather than a lookup table, so the discriminated union narrows for free and
 * the compiler — not a runtime cast — is what guarantees each format is handed a
 * definition it understands.
 *
 * All four formats are rendered now, so `isPlayableQuestion` answers `true` for
 * every member of the union. It stays — and stays exhaustive rather than
 * `return true` — because it is the gate the engine asks *before* a question
 * joins the session, and a fifth format added to the schema must be dropped from
 * the quiz rather than reached and rendered blank.
 */

export function isPlayableQuestion(
  definition: QuizQuestionDefinition,
): definition is PlayableQuestion {
  switch (definition.type) {
    case "mcq":
    case "picture_select":
    case "match_pair":
    case "drag_answer":
      return true;
    default:
      return false;
  }
}

export function renderQuestion({
  definition,
  ...rest
}: QuestionProps): ReactNode {
  switch (definition.type) {
    case "mcq":
      return <McqQuestion definition={definition} {...rest} />;
    case "picture_select":
      return <PictureSelectQuestion definition={definition} {...rest} />;
    case "match_pair":
      return <MatchPairQuestion definition={definition} {...rest} />;
    case "drag_answer":
      return <DragAnswerQuestion definition={definition} {...rest} />;
  }
}
