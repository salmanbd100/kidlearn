"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { OnboardingStep } from "@/features/parent/OnboardingStep";
import { submitConsent } from "@/features/parent/parent-api";
import { generalErrorKey } from "@/features/parent/parent-errors";
import type { ApiFailure } from "@/shared/api/api-client";

/** COPPA consent (FR-AUTH-03). */
export function ConsentScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();
  const checkboxId = useId();

  const [isAccepted, setIsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAccepted || isSubmitting) return;

    setIsSubmitting(true);
    setFailure(undefined);
    const result = await submitConsent();

    if (result.ok) {
      // Re-reads `consentGivenAt`, which moves the guard on; not a local flag, as the server record decides.
      await refresh();
      // Normally unreachable, but if `refresh()` came back without the record a disabled button would strand the parent.
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setFailure(result.error);
  };

  const errorMessage =
    failure === undefined
      ? undefined
      : failure.code === "CONFLICT"
        ? t("consent.outdated")
        : t(generalErrorKey(failure));

  return (
    <OnboardingStep
      step={1}
      title={t("consent.title")}
      description={t("consent.intro")}
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4">
          <h2 className="font-semibold text-card-foreground text-sm">
            {t("consent.collectTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground text-sm">
            <li>{t("consent.collectProfile")}</li>
            <li>{t("consent.collectProgress")}</li>
            <li>{t("consent.collectAccount")}</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4">
          <h2 className="font-semibold text-card-foreground text-sm">
            {t("consent.neverTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground text-sm">
            <li>{t("consent.neverAds")}</li>
            <li>{t("consent.neverSocial")}</li>
            <li>{t("consent.neverSpend")}</li>
          </ul>
        </section>

        <p className="text-muted-foreground text-sm">{t("consent.rights")}</p>

        {/* A native checkbox is already accessible; the 44px padded label is the touch target (design.md §7). */}
        <label
          htmlFor={checkboxId}
          className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-foreground text-sm"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={isAccepted}
            onChange={(event) => setIsAccepted(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-(--primary) focus-ring"
          />
          <span>{t("consent.checkbox")}</span>
        </label>

        {errorMessage !== undefined ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={!isAccepted || isSubmitting}>
          {t("consent.submit")}
        </Button>
      </form>
    </OnboardingStep>
  );
}
