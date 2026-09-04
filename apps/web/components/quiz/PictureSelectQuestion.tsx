"use client";

import type { PictureSelectQuestion as PictureSelectDefinition } from "@kidlearn/types";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { OptionCard } from "./OptionCard";
import type { QuestionProps } from "./types";
import { useOptionChoice } from "./use-option-choice";

/** Tap the picture (FR-QUIZ-04). */
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
