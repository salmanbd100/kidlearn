import type {
  DragAnswerQuestion,
  Locale,
  MatchPairQuestion,
  McqQuestion,
  PictureSelectQuestion,
  QuizAnswerValue,
  QuizResponseRecord,
} from "@kidlearn/types";
import type { QuestionFeedback } from "./use-question-feedback";

export type { QuizAnswerValue };

export type PlayableQuestion =
  | McqQuestion
  | PictureSelectQuestion
  | MatchPairQuestion
  | DragAnswerQuestion;

/**
 * A superset of the wire shape: `isFirstAttemptCorrect` is client-only (it picks the star or
 * sparkle) and is not sent; the server derives its verdict from `answer` and `attempts`
 * (`backend.md §8`).
 */
export type QuizAnswerRecord = QuizResponseRecord & {
  isFirstAttemptCorrect: boolean;
};

export interface QuestionProps<T extends PlayableQuestion = PlayableQuestion> {
  definition: T;
  locale: Locale;
  feedback: QuestionFeedback;
  onAttempt: (answer: QuizAnswerValue, isCorrect: boolean) => void;
  onCommit: (answer: QuizAnswerValue) => void;
}

export interface QuizEngineProps {
  quizId: string;
  questions: readonly { id: string; definition: unknown }[];
  locale: Locale;
  onFinish: (records: readonly QuizAnswerRecord[]) => void;
}
