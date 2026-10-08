import {
  QUIZ_QUESTION_SCHEMAS,
  QUIZ_QUESTION_TYPES,
  type QuizQuestionType,
} from "@kidlearn/types";
import { generateStructured } from "./gemini-text.js";
import type { GenerationStopReason, TokenUsage } from "./types.js";

// The format is chosen here, not by the model: it is the call's response schema, and the four-format union
// (12KB, 15 levels deep) is rejected by responseJsonSchema with a 400 INVALID_ARGUMENT.
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
  retryFeedback?: string;
}

export interface GenerateQuestionsResult {
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

    // A refusal or cut-off ends the set: runGenerationJob fails the job on either without a retry,
    // so further calls would be paid for and thrown away.
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
