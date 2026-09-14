import {
  QUIZ_QUESTION_SCHEMAS,
  QUIZ_QUESTION_TYPES,
  type QuizQuestionType,
} from "@kidlearn/types";
import { generateStructured } from "./gemini-text.js";
import type { GenerationStopReason, TokenUsage } from "./types.js";

/**
 * Quiz questions, one model call each (FR-AI-01, FR-AI-03).
 *
 * The format is chosen here rather than by the model because the format *is* the
 * call's response schema. Asking for the four-format union in one call is a
 * `400 INVALID_ARGUMENT`: `responseJsonSchema` rejects a schema this large, and
 * the union of all four questions is 12KB and fifteen levels deep before the
 * lesson's own fields are added. A single format is a quarter of that and is
 * accepted.
 */

/** Which format each question takes, rotating so a quiz is a mix, not four of a kind. */
export function planQuestionFormats(count: number): QuizQuestionType[] {
  return Array.from(
    { length: count },
    (_, index) => QUIZ_QUESTION_TYPES[index % QUIZ_QUESTION_TYPES.length],
  );
}

export interface GenerateQuestionsOptions {
  system: string;
  formats: readonly QuizQuestionType[];
  /** `position` is 1-based: it is what the prompt calls the question. */
  buildPrompt: (format: QuizQuestionType, position: number) => string;
  /** Appended to every call, as `runGenerationJob` retries the whole set. */
  retryFeedback?: string;
}

export interface GenerateQuestionsResult {
  /** Exactly as the model wrote them. Validated by the caller's schema, not here. */
  questions: unknown[];
  usage: TokenUsage;
  stopReason: GenerationStopReason | null;
  refusal?: string;
}

export async function generateQuestions(
  options: GenerateQuestionsOptions,
): Promise<GenerateQuestionsResult> {
  const questions: unknown[] = [];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (const [index, format] of options.formats.entries()) {
    const prompt = options.buildPrompt(format, index + 1);
    const generated = await generateStructured({
      system: options.system,
      messages:
        options.retryFeedback === undefined
          ? [{ role: "user", content: prompt }]
          : [
              { role: "user", content: prompt },
              { role: "user", content: options.retryFeedback },
            ],
      outputSchema: QUIZ_QUESTION_SCHEMAS[format],
    });

    usage.inputTokens += generated.usage.inputTokens;
    usage.outputTokens += generated.usage.outputTokens;

    // A refusal or a cut-off answer ends the set rather than merely joining it.
    // `runGenerationJob` fails the job on either without a retry, so the calls
    // still to come would be paid for and then thrown away.
    if (
      generated.stopReason === "refusal" ||
      generated.stopReason === "max_tokens"
    ) {
      return {
        questions,
        usage,
        stopReason: generated.stopReason,
        ...(generated.refusal === undefined
          ? {}
          : { refusal: generated.refusal }),
      };
    }

    questions.push(generated.raw);
  }

  return { questions, usage, stopReason: "stop" };
}
