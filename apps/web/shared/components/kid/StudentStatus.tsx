"use client";

import { DEFAULT_NAMESPACE } from "@kidlearn/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BigButton } from "./BigButton";

export function StudentStatus({
  tone,
  onRetry,
  children,
}: {
  tone: "status" | "alert";
  /** A way out of a failure: a child on a tablet has no reload button to reach for. */
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(DEFAULT_NAMESPACE);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <span aria-hidden="true" className="text-6xl">
        🦉
      </span>
      <p
        role={tone}
        className="text-center font-display text-foreground text-xl"
      >
        {children}
      </p>
      {onRetry === undefined ? null : (
        <BigButton size="lg" onPress={onRetry}>
          {t("actions.tryAgain")}
        </BigButton>
      )}
    </div>
  );
}
