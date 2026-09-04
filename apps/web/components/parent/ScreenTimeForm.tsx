"use client";

import type {
  ScreenTimeSettingResponse,
  ScreenTimeUpdate,
} from "@kidlearn/types";
import {
  SCREEN_TIME_LIMIT_OPTIONS,
  ScreenTimeUpdateSchema,
} from "@kidlearn/types";
import { Button, Input, Label } from "@kidlearn/ui";
import Link from "next/link";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiFailure, ApiResult } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { screenTimeErrorKey } from "@/lib/parent-errors";
import { SegmentedField } from "./SegmentedField";

/**
 * The parent's screen-time controls for one child (FR-TIME-01, FR-TIME-04..05).
 */

/** The `null` limit as a radio value — a radio group's value is a string. */
const LIMIT_OFF = "off";

/** Sensible first window for a parent switching the toggle on. */
const DEFAULT_WINDOW = { start: "07:00", end: "19:00" } as const;

export interface ScreenTimeFormProps {
  childName: string;
  initial: ScreenTimeSettingResponse;
  onSubmit: (
    values: ScreenTimeUpdate,
  ) => Promise<ApiResult<ScreenTimeSettingResponse>>;
  /** Runs after `onSubmit` succeeds — the screen shows its confirmation. */
  onSaved: (setting: ScreenTimeSettingResponse) => void;
  cancelHref?: string;
}

export function ScreenTimeForm({
  childName,
  initial,
  onSubmit,
  onSaved,
  cancelHref,
}: ScreenTimeFormProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const fieldId = useId();

  const [limit, setLimit] = useState<string>(
    initial.dailyLimitMinutes === null
      ? LIMIT_OFF
      : String(initial.dailyLimitMinutes),
  );
  const [isWindowOn, setIsWindowOn] = useState(initial.windowStart !== null);
  // Kept while the toggle is off, so switching it back on restores what the
  // parent had rather than resetting to the default they already replaced.
  const [windowStart, setWindowStart] = useState(
    initial.windowStart ?? DEFAULT_WINDOW.start,
  );
  const [windowEnd, setWindowEnd] = useState(
    initial.windowEnd ?? DEFAULT_WINDOW.end,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<ApiFailure | undefined>();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    const parsed = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: limit === LIMIT_OFF ? null : Number(limit),
      windowStart: isWindowOn ? windowStart : null,
      windowEnd: isWindowOn ? windowEnd : null,
    });
    if (!parsed.success) {
      // The controls cannot express an invalid combination — the limit comes from
      // a closed set and the toggle sets both window ends together — so a failure
      // here is a browser handing back a time input's empty value, and the generic
      // message is the honest one.
      setFormError({ code: "VALIDATION_FAILED", message: "Invalid settings" });
      return;
    }

    setFormError(undefined);
    setIsSaving(true);
    const result = await onSubmit(parsed.data);
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }
    setFormError(result.error);
  };

  const limitOptions = [
    { value: LIMIT_OFF, label: t("screenTime.limitOff") },
    ...SCREEN_TIME_LIMIT_OPTIONS.map((minutes) => ({
      value: String(minutes),
      label: t("screenTime.limitMinutes", { count: minutes }),
    })),
  ];

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <SegmentedField
        label={t("screenTime.limit")}
        name="dailyLimitMinutes"
        value={limit}
        options={limitOptions}
        onChange={setLimit}
        hint={t("screenTime.limitHint", { name: childName })}
      />

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-2 font-medium text-foreground text-sm">
          {t("screenTime.window")}
        </legend>

        {/* A plain checkbox, sized to the 44px parent-surface target: it is one
            binary choice and the native control announces its own state. */}
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isWindowOn}
            onChange={(event) => setIsWindowOn(event.target.checked)}
            className="size-5 accent-primary"
          />
          <span className="text-foreground text-sm">
            {t("screenTime.windowToggle")}
          </span>
        </label>

        {isWindowOn ? (
          <>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-start`}>
                  {t("screenTime.windowStart")}
                </Label>
                <Input
                  id={`${fieldId}-start`}
                  type="time"
                  value={windowStart}
                  className="h-11 w-40"
                  onChange={(event) => setWindowStart(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-end`}>
                  {t("screenTime.windowEnd")}
                </Label>
                <Input
                  id={`${fieldId}-end`}
                  type="time"
                  value={windowEnd}
                  className="h-11 w-40"
                  onChange={(event) => setWindowEnd(event.target.value)}
                />
              </div>
            </div>
            {/* The server treats an equal pair as "no window" rather than locking
                the child out all day, so the parent is told before they save. */}
            {windowStart === windowEnd ? (
              <p role="alert" className="text-muted-foreground text-sm">
                {t("screenTime.windowSame")}
              </p>
            ) : null}
          </>
        ) : null}

        <p className="text-muted-foreground text-sm">
          {t("screenTime.windowHint", { name: childName })}
        </p>
      </fieldset>

      {formError !== undefined ? (
        <p role="alert" className="text-destructive text-sm">
          {t(screenTimeErrorKey(formError))}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {cancelHref !== undefined ? (
          <Button asChild variant="ghost">
            <Link href={cancelHref}>{t("form.cancel")}</Link>
          </Button>
        ) : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("form.saving") : t("form.save")}
        </Button>
      </div>
    </form>
  );
}
