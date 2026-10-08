"use client";

import type { Locale } from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { useState } from "react";
import { generateQuiz } from "@/features/admin/ai-api";

/** Both locales, always: a stored question requires both (FR-I18N-01). */
const LANGUAGES: Locale[] = [...LOCALES];

const QUESTION_COUNT = 4;

export interface GenerateQuizButtonProps {
  lessonId: string;
  isBusy: boolean;
  onGenerated: (message: string) => void;
  onError: (message: string) => void;
}

export function GenerateQuizButton({
  lessonId,
  isBusy,
  onGenerated,
  onError,
}: GenerateQuizButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleClick() {
    setIsGenerating(true);

    const result = await generateQuiz({
      lessonId,
      count: QUESTION_COUNT,
      languages: LANGUAGES,
    });

    setIsGenerating(false);

    if (!result.ok) {
      onError(result.error.message);
      return;
    }

    if (result.data.status === "failed") {
      // Not an error response: the job exists with both attempts (FR-AI-08).
      onError(
        `The model could not produce usable questions. Job ${result.data.jobId} kept what it tried, so it can be read in the AI Queue.`,
      );
      return;
    }

    onGenerated(
      `${QUESTION_COUNT} draft questions added to this lesson's quiz. They are in the review queue and invisible to children until published.`,
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isBusy || isGenerating}
      onClick={() => void handleClick()}
    >
      {isGenerating
        ? "Writing — this takes a moment…"
        : "Generate questions with AI"}
    </Button>
  );
}
