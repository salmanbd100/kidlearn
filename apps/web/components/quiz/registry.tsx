"use client";

import type { QuizQuestionDefinition } from "@kidlearn/types";
import type { ReactNode } from "react";
import { DragAnswerQuestion } from "./DragAnswerQuestion";
import { MatchPairQuestion } from "./MatchPairQuestion";
import { McqQuestion } from "./McqQuestion";
import { PictureSelectQuestion } from "./PictureSelectQuestion";
import type { PlayableQuestion, QuestionProps } from "./types";

// Question format → renderer (FR-QUIZ-07).

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
