"use client";

import { Button } from "@kidlearn/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { OnboardingStep } from "@/components/parent/OnboardingStep";
import type { ApiFailure } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { submitConsent } from "@/lib/parent-api";
import { generalErrorKey } from "@/lib/parent-errors";

/**
 * COPPA consent (FR-AUTH-03).
 *
 * Three properties this screen has to have, and why:
 *
 *  - **The checkbox starts unchecked and the button is disabled until it is
 *    ticked.** A pre-ticked box is not consent, and neither is a button a parent
 *    could press without having made a choice.
 *  - **Plain language, in both locales.** The text a parent agreed to is the whole
 *    value of the record, so it is prose in `parent.json` rather than a link to a
 *    policy page nobody opens. `CONSENT_VERSION` names this text: if the wording
 *    changes materially, that constant is bumped and every parent re-consents.
 *  - **It is the only way past.** `resolveParentRedirect` sends a parent with no
 *    consent record here from anywhere else, so no child profile UI is reachable
 *    before it.
 *
 * A `409` means the server's version has moved past the copy on screen. That is not
 * an error to retry — it is a prompt to read the new text — so it gets its own
 * message.
 */
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
      // Re-reads `consentGivenAt`, which is what moves the guard on to PIN setup.
      // Deliberately not a local "done" flag: the server's record is the only
      // thing that decides whether consent exists.
      await refresh();
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
        <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4">
          <h2 className="font-semibold text-card-foreground text-sm">
            {t("consent.collectTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground text-sm">
            <li>{t("consent.collectProfile")}</li>
            <li>{t("consent.collectProgress")}</li>
            <li>{t("consent.collectAccount")}</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4">
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

        {/* A native checkbox: it is already accessible, already keyboard-operable,
            and needs no Radix wrapper. The 44px padded label is the touch target
            (design.md §7), not the 16px box. */}
        <label
          htmlFor={checkboxId}
          className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-foreground text-sm"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={isAccepted}
            onChange={(event) => setIsAccepted(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
