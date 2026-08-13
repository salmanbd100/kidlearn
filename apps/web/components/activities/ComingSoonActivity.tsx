"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BigButton } from "@/components/kid/BigButton";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { ActivityRendererProps } from "./registry";

/**
 * The stand-in for an activity type whose renderer has not landed yet.
 *
 * `trace` (file 19), `match` and `puzzle` (file 20) route here until they are
 * built. It exists so those files can land one at a time without any of them
 * blocking a lesson playthrough in dev: a seeded lesson with a trace activity is
 * walkable today, and swapping in the real renderer is a one-line change in
 * `registry.tsx`.
 *
 * It reports completion rather than skipping, because from the step engine's
 * point of view the child did reach the end of the activity step — there was
 * simply nothing in it yet.
 */
export function ComingSoonActivity({
  onActivityComplete,
}: ActivityRendererProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);

  return (
    <div
      data-testid="activity-coming-soon"
      className="flex flex-1 flex-col items-center justify-center gap-8 text-center"
    >
      <Sparkles
        aria-hidden="true"
        className="size-24 text-accent"
        strokeWidth={1.5}
      />
      <BigButton size="lg" isPulsing onPress={onActivityComplete}>
        {t("activity.done")}
      </BigButton>
    </div>
  );
}
