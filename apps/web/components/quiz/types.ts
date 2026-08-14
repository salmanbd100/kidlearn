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

/**
 * The contracts the quiz engine and its four question formats are written
 * against (FR-QUIZ-07).
 *
 * The answer shapes themselves are **not** declared here: they are the request
 * body `POST /api/progress/quizzes/:quizId/responses` validates with, so they
 * live in `@kidlearn/types` and are re-exported below. A second declaration of
 * the same shape on the client is a second thing to keep in step, and the one
 * that drifts is always the one the server does not check.
 */

export type { QuizAnswerValue };

/** Every format the registry can render. */
export type PlayableQuestion =
  | McqQuestion
  | PictureSelectQuestion
  | MatchPairQuestion
  | DragAnswerQuestion;

/**
 * One answered question, as the engine accumulates it and the endpoint stores it.
 *
 * `isCorrect` is **true only when the first attempt was correct**, and that is
 * what the score is computed from. A quiz here has no fail state: a child stays
 * on a question, retrying among the options still available, until they get it
 * right (§5.7). So "did they answer correctly in the end" is a constant `true`
 * and worth nothing — the only thing that carries information is whether they
 * knew it straight away. `attempts` carries how hard it was.
 */
export type QuizAnswerRecord = QuizResponseRecord;

export interface QuestionProps<T extends PlayableQuestion = PlayableQuestion> {
  definition: T;
  locale: Locale;
  /** Shared across every format, so the beat after a tap is the same one. */
  feedback: QuestionFeedback;
  /** Every tap, right or wrong. This is what counts attempts. */
  onAttempt: (answer: QuizAnswerValue, isCorrect: boolean) => void;
  /** The right answer, after its feedback has been heard — the engine advances. */
  onCommit: (answer: QuizAnswerValue) => void;
}

export interface QuizEngineProps {
  /**
   * Unused until file 22, which posts the records against it. Carried now so the
   * step wiring that hands it down does not change when submission lands.
   */
  quizId: string;
  /** Raw `QuizQuestion.definition` JSONB rows, in the order the server sent them. */
  questions: readonly { id: string; definition: unknown }[];
  locale: Locale;
  onFinish: (records: readonly QuizAnswerRecord[]) => void;
}
