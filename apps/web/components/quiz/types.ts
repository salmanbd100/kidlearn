import type {
  Locale,
  McqQuestion,
  PictureSelectQuestion,
} from "@kidlearn/types";
import type { QuestionFeedback } from "./use-question-feedback";

/**
 * The contracts the quiz engine, its question formats and file 22's submission
 * API are all written against (FR-QUIZ-07).
 *
 * Fixed here rather than inside the engine because the records this file
 * produces are the request body file 22 posts: the shape has to be settled
 * before the thing that consumes it exists, or the engine gets rewritten around
 * whatever the endpoint turned out to want.
 */

/** The formats this file ships. File 22 widens it with the other two. */
export type PlayableQuestion = McqQuestion | PictureSelectQuestion;

/**
 * One answer, as the child gave it.
 *
 * A bare option id covers every pick-one format (`mcq`, `picture_select`, and
 * `drag_answer` when it lands). The `pairs` variant is `match_pair`'s, declared
 * now so that the record below is the same shape in both files rather than
 * something file 22 has to widen after the fact.
 */
export type QuizAnswerValue =
  | string
  | { pairs: { leftId: string; rightId: string }[] };

export interface QuizAnswerRecord {
  questionId: string;
  /** The committed answer, which is always the correct one — see `isCorrect`. */
  answer: QuizAnswerValue;
  /**
   * **True only when the first attempt was correct**, and this is what scoring
   * and coins are computed from (file 22).
   *
   * A quiz here has no fail state: a child stays on a question, retrying among
   * the options still available, until they get it right (§5.7). So "did they
   * answer correctly in the end" is a constant `true` and worth nothing — the
   * only thing that carries information is whether they knew it straight away.
   */
  isCorrect: boolean;
  /** Taps on this question until it was answered correctly. Always ≥ 1. */
  attempts: number;
}

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
