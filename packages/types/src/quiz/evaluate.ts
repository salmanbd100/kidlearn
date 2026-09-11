import type { QuizAnswerValue } from "../domain/progress.js";
import type { QuizQuestionDefinition } from "./schemas.js";

/**
 * What counts as a right answer, for every quiz format (FR-QUIZ-01..04).
 *
 * Lives here rather than in `apps/web` because the **server** is the authority on
 * whether an answer was right (`backend.md §8`): the player runs this to decide
 * whether to celebrate or ask again, and `recordQuizResponses` runs the same
 * function against the same stored `definition` before writing
 * `QuizResponse.isCorrect`. One definition, so the two cannot disagree about what
 * a correct answer is.
 */
export function evaluateAnswer(
  question: QuizQuestionDefinition,
  answer: QuizAnswerValue,
): boolean {
  switch (question.type) {
    case "mcq":
    case "picture_select":
    case "drag_answer":
      return answer === question.correctOptionId;
    case "match_pair":
      return isMatchComplete(question.correctPairs, answer);
  }
}

/** True only when the answer is *every* correct pair and nothing else. */
function isMatchComplete(
  correctPairs: readonly { leftId: string; rightId: string }[],
  answer: QuizAnswerValue,
): boolean {
  // A pick-one answer handed to a pairing question: wrong, not a crash. The
  // engine keys each question's component by id, so a stale commit from the
  // previous question is the shape that would arrive here — and on the server it
  // is simply what a hand-written request body looks like.
  if (typeof answer === "string") return false;

  const key = (leftId: string, rightId: string) => `${leftId}::${rightId}`;
  const correct = new Set(
    correctPairs.map((pair) => key(pair.leftId, pair.rightId)),
  );

  // Matched against the answer key set rather than counted, so the same pair
  // sent twice cannot stand in for one that is missing.
  const matched = new Set<string>();
  for (const pair of answer.pairs) {
    const forwards = key(pair.leftId, pair.rightId);
    const backwards = key(pair.rightId, pair.leftId);
    if (correct.has(forwards)) matched.add(forwards);
    else if (correct.has(backwards)) matched.add(backwards);
    else return false;
  }

  return matched.size === correctPairs.length;
}
