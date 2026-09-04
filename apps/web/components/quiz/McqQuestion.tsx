"use client";

import type { McqQuestion as McqDefinition } from "@kidlearn/types";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { OptionCard } from "./OptionCard";
import type { QuestionProps } from "./types";
import { useOptionChoice } from "./use-option-choice";

/** Pick the right one (FR-QUIZ-01). */
export function McqQuestion({
  definition,
  locale,
  feedback,
  onAttempt,
  onCommit,
}: QuestionProps<McqDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { chosenId, triedIds, choose } = useOptionChoice({
    definition,
    feedback,
    onAttempt,
    onCommit,
  });

  return (
    <ul
      data-testid="quiz-mcq"
      className="grid w-full max-w-2xl grid-cols-1 gap-4 landscape:grid-cols-2"
    >
      {definition.options.map((option, index) => (
        <li key={option.id} className="flex">
          <OptionCard
            optionId={option.id}
            shape="text"
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
