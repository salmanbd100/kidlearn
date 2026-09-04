"use client";

import type { LessonStep } from "@kidlearn/types";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BigButton } from "@/components/kid/BigButton";
import { LESSON_NAMESPACE } from "@/lib/i18n";

/** The stand-in body of a step that has not been built yet. */
export function StepPlaceholder({
  step,
  title,
  onComplete,
}: {
  step: LessonStep;
  title: string;
  onComplete: () => void;
}) {
  const { t } = useTranslation(LESSON_NAMESPACE);

  return (
    <section
      // The step name reaches the DOM so the player's tests — and file 17's, and
      // file 21's — can assert which step is on screen without matching copy that
      // is expected to change.
      data-step={step}
      className="flex flex-1 flex-col items-center justify-center gap-8 text-center"
    >
      <h1 className="font-display text-2xl text-foreground sm:text-3xl">
        {t(`steps.${step}`)}
      </h1>
      <p className="font-display text-foreground text-xl">{title}</p>
      <BigButton
        size="lg"
        icon={<ArrowRight aria-hidden="true" />}
        onPress={onComplete}
      >
        {t("next")}
      </BigButton>
    </section>
  );
}
