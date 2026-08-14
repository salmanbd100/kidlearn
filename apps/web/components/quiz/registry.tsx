"use client";

import type { QuizQuestionDefinition } from "@kidlearn/types";
import type { ReactNode } from "react";
import { McqQuestion } from "./McqQuestion";
import { PictureSelectQuestion } from "./PictureSelectQuestion";
import type { PlayableQuestion, QuestionProps } from "./types";

/**
 * Question format → renderer (FR-QUIZ-07).
 *
 * The same shape as `activities/registry.tsx`, for the same reasons: a `switch`
 * rather than a lookup table, so the discriminated union narrows for free and
 * the compiler — not a runtime cast — is what guarantees each format is handed a
 * definition it understands. Widening `PlayableQuestion` in file 22 stops this
 * compiling until the two new cases are written.
 *
 * `isPlayableQuestion` is the other half of the contract: the engine asks it
 * *before* a question joins the session, so a format this file cannot render is
 * dropped rather than reached and rendered blank.
 */

export function isPlayableQuestion(
  definition: QuizQuestionDefinition,
): definition is PlayableQuestion {
  switch (definition.type) {
    case "mcq":
    case "picture_select":
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
  }
}
