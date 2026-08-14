"use client";

import type { PictureSelectQuestion as PictureSelectDefinition } from "@kidlearn/types";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { OptionCard } from "./OptionCard";
import type { QuestionProps } from "./types";
import { useOptionChoice } from "./use-option-choice";

/**
 * Tap the picture (FR-QUIZ-04).
 *
 * The same interaction as the MCQ and deliberately so — what changes is that the
 * picture *is* the answer here rather than an illustration of it, which is why
 * the schema makes the image required and why the card is a square the image
 * fills. A label under it is optional and small: a child who cannot read must be
 * able to answer from the picture alone.
 *
 * Two columns at every width. The grid is the format — a 2×2 of pictures is
 * scannable at a glance, and a single column would put half the answers off the
 * bottom of a phone (design.md §6).
 */
export function PictureSelectQuestion({
  definition,
  locale,
  feedback,
  onAttempt,
  onCommit,
}: QuestionProps<PictureSelectDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { chosenId, triedIds, choose } = useOptionChoice({
    definition,
    feedback,
    onAttempt,
    onCommit,
  });

  return (
    <ul
      data-testid="quiz-picture-select"
      className="grid w-full max-w-lg grid-cols-2 gap-4 landscape:max-w-md"
    >
      {definition.options.map((option, index) => (
        <li key={option.id} className="flex">
          <OptionCard
            optionId={option.id}
            shape="picture"
            state={
              option.id === chosenId
                ? "correct"
                : triedIds.has(option.id)
                  ? "tried"
                  : "idle"
            }
            label={option.text?.[locale]}
            image={option.image}
            locale={locale}
            triedLabel={t("quiz.optionTried")}
            correctLabel={t("quiz.optionCorrect")}
            pictureLabel={t("quiz.optionPicture", { number: index + 1 })}
            onSelect={() => choose(option.id)}
          />
        </li>
      ))}
    </ul>
  );
}
