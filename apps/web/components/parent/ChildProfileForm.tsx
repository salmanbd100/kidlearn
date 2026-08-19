"use client";

import type { ChildProfileCreate, ChildProfileResponse } from "@kidlearn/types";
import {
  ChildProfileCreateSchema,
  MAX_CHILD_AGE,
  MAX_CHILD_FIRST_NAME_LENGTH,
  MIN_CHILD_AGE,
} from "@kidlearn/types";
import { Button, Input, Label } from "@kidlearn/ui";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiFailure, ApiResult } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { listAvatars, listChildCharacters } from "@/lib/parent-api";
import {
  childWriteErrorKey,
  type FieldErrors,
  toFieldErrors,
} from "@/lib/parent-errors";
import { AvatarPicker, type AvatarPickerOption } from "./AvatarPicker";
import { SegmentedField } from "./SegmentedField";

/**
 * Create or edit a learner profile (FR-PROF-02).
 *
 * ## Validation
 *
 * Every rule comes from `ChildProfileCreateSchema` in `@kidlearn/types` — the same
 * object `POST /api/children` validates the body with. Nothing here restates a
 * limit: the age bounds and the name length are imported constants, and the
 * decision about whether a value is acceptable is `safeParse`. Only the *wording*
 * of each message is local, because Zod's messages are English strings written for
 * a developer (`lib/parent-errors.ts`).
 *
 * That is why a client-side rule cannot drift from the server's here. It also
 * means the form cannot construct a payload the API would reject on shape — the
 * value it submits is `safeParse`'s output, not the raw form state.
 *
 * ## Why this fetches its avatars
 *
 * `avatarCharacterId` is a `Character` row id, so the options cannot be a list in
 * this app; they come from `GET /api/characters`. This component is their only
 * consumer, and the client-side fetch is covered by the same forced exception
 * documented in `app/(parent)/context/parent-session.tsx` — the session cookie
 * lives on the API origin, so no Server Component can make this call.
 */

/** KG-2 is omitted at MVP (spec §10), so the control offers two grades. */
const GRADE_OPTIONS = [
  { value: "NURSERY", labelKey: "form.gradeNursery" },
  { value: "KG1", labelKey: "form.gradeKg1" },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en", labelKey: "form.languageEn" },
  { value: "bn", labelKey: "form.languageBn" },
] as const;

/** What the controls hold. `age` is a number the stepper keeps inside its bounds. */
type FormValues = {
  firstName: string;
  age: number;
  gradeLevel: string;
  preferredLanguage: string;
  avatarCharacterId: string;
};

const EMPTY_VALUES: FormValues = {
  firstName: "",
  age: MIN_CHILD_AGE,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: "",
};

export interface ChildProfileFormProps {
  /** Pre-fills the form for an edit. Absent means a new profile. */
  initial?: ChildProfileResponse;
  onSubmit: (
    values: ChildProfileCreate,
  ) => Promise<ApiResult<ChildProfileResponse>>;
  /** Runs after `onSubmit` succeeds. */
  onSaved: (child: ChildProfileResponse) => void;
  submitLabel: string;
  /** Renders a cancel link when there is somewhere to go back to. */
  cancelHref?: string;
}

export function ChildProfileForm({
  initial,
  onSubmit,
  onSaved,
  submitLabel,
  cancelHref,
}: ChildProfileFormProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const fieldId = useId();

  const [values, setValues] = useState<FormValues>(() =>
    initial
      ? {
          firstName: initial.firstName,
          age: initial.age,
          gradeLevel: initial.gradeLevel,
          preferredLanguage: initial.preferredLanguage,
          avatarCharacterId: initial.avatarCharacterId ?? "",
        }
      : EMPTY_VALUES,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<ApiFailure | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [avatars, setAvatars] = useState<AvatarPickerOption[]>([]);
  const childId = initial?.id;

  useEffect(() => {
    let isCurrent = true;

    // A profile that does not exist yet has nothing unlocked to show, so
    // creation reads the starter set and editing reads this child's own list —
    // which carries the earned characters as well as the locked ones
    // (FR-GAM-05). Both answer the same question the update route enforces.
    const load =
      childId === undefined
        ? listAvatars()
        : listChildCharacters(childId).then((result) =>
            result.ok
              ? { ok: true as const, data: result.data.characters }
              : result,
          );

    void load.then((result) => {
      if (isCurrent && result.ok) setAvatars(result.data);
    });
    return () => {
      isCurrent = false;
    };
  }, [childId]);

  /** Clears a field's error as soon as it changes, never adds one mid-typing. */
  const update = <TKey extends keyof FormValues>(
    key: TKey,
    value: FormValues[TKey],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) =>
      current[key] === undefined ? current : { ...current, [key]: undefined },
    );
    setFormError(undefined);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    const parsed = ChildProfileCreateSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      return;
    }

    setFieldErrors({});
    setIsSaving(true);
    // `parsed.data`, not `values` — the trimmed, schema-shaped object.
    const result = await onSubmit(parsed.data);
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }
    setFormError(result.error);
  };

  /**
   * Interpolation is per-field: the name message needs the character limit and the
   * age message needs the age bounds, and one shared bag of values would put 50 in
   * "between 3 and 50". The numbers are the schema's own exported constants, so a
   * message can never quote a limit the validator does not enforce.
   */
  const ERROR_PARAMS: Record<string, Record<string, number>> = {
    firstName: { max: MAX_CHILD_FIRST_NAME_LENGTH },
    age: { min: MIN_CHILD_AGE, max: MAX_CHILD_AGE },
  };

  const errorFor = (field: keyof FormValues): string | undefined => {
    const key = fieldErrors[field];
    if (key === undefined) return undefined;
    return t(key, ERROR_PARAMS[field] ?? {});
  };

  const nameError = errorFor("firstName");
  const ageError = errorFor("age");
  const avatarError = errorFor("avatarCharacterId");

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-firstName`}>{t("form.firstName")}</Label>
        <Input
          id={`${fieldId}-firstName`}
          value={values.firstName}
          maxLength={MAX_CHILD_FIRST_NAME_LENGTH}
          autoComplete="off"
          aria-invalid={nameError !== undefined}
          aria-describedby={
            nameError === undefined
              ? `${fieldId}-firstName-hint`
              : `${fieldId}-firstName-error`
          }
          onChange={(event) => update("firstName", event.target.value)}
        />
        {nameError === undefined ? (
          <p
            id={`${fieldId}-firstName-hint`}
            className="text-muted-foreground text-sm"
          >
            {t("form.firstNameHint")}
          </p>
        ) : (
          <FieldError id={`${fieldId}-firstName-error`}>{nameError}</FieldError>
        )}
      </div>

      <AgeStepper
        value={values.age}
        error={ageError}
        onChange={(age) => update("age", age)}
      />

      <SegmentedField
        label={t("form.grade")}
        name="gradeLevel"
        value={values.gradeLevel}
        options={GRADE_OPTIONS.map(({ value, labelKey }) => ({
          value,
          label: t(labelKey),
        }))}
        onChange={(value) => update("gradeLevel", value)}
      />

      <SegmentedField
        label={t("form.language")}
        name="preferredLanguage"
        value={values.preferredLanguage}
        options={LANGUAGE_OPTIONS.map(({ value, labelKey }) => ({
          value,
          label: t(labelKey),
        }))}
        onChange={(value) => update("preferredLanguage", value)}
      />

      <div className="flex flex-col gap-2">
        <span className="font-medium text-foreground text-sm">
          {t("form.avatar")}
        </span>
        <AvatarPicker
          options={avatars}
          value={values.avatarCharacterId}
          isInvalid={avatarError !== undefined}
          describedById={
            avatarError === undefined
              ? `${fieldId}-avatar-hint`
              : `${fieldId}-avatar-error`
          }
          onChange={(id) => update("avatarCharacterId", id)}
        />
        {avatarError === undefined ? (
          <p
            id={`${fieldId}-avatar-hint`}
            className="text-muted-foreground text-sm"
          >
            {t("form.avatarHint")}
          </p>
        ) : (
          <FieldError id={`${fieldId}-avatar-error`}>{avatarError}</FieldError>
        )}
      </div>

      {formError !== undefined ? (
        <p role="alert" className="text-destructive text-sm">
          {/* The max-5 rule's second half: a `409` that slipped past the hidden
              Add button becomes the same friendly note (FR-PROF-01). */}
          {t(childWriteErrorKey(formError))}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {cancelHref !== undefined ? (
          <Button asChild variant="ghost">
            <Link href={cancelHref}>{t("form.cancel")}</Link>
          </Button>
        ) : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("form.saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {children}
    </p>
  );
}

/**
 * Age, bounded to the range the platform is built for.
 *
 * A stepper rather than a free text field: there are four legal values, and a
 * control that cannot express an illegal one is better than one that validates
 * afterwards. The buttons disable at the bounds, and the value is a live region so
 * a screen-reader user hears each change without re-reading the group.
 */
function AgeStepper({
  value,
  error,
  onChange,
}: {
  value: number;
  error: string | undefined;
  onChange: (age: number) => void;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    // A real `fieldset`/`legend` rather than a div with `role="group"`: the two
    // buttons and the value are one control, and the native pair gets the label
    // read before any of them without an `aria-labelledby` of ours.
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-medium text-foreground text-sm">
        {t("form.age")}
      </legend>
      <div className="flex items-center gap-4">
        <StepperButton
          label={t("form.ageDecrease")}
          isDisabled={value <= MIN_CHILD_AGE}
          onPress={() => onChange(value - 1)}
        >
          <Minus aria-hidden="true" className="size-5" />
        </StepperButton>
        <output
          aria-live="polite"
          className="min-w-24 text-center font-semibold text-foreground text-lg"
        >
          {t("form.ageYears", { age: value })}
        </output>
        <StepperButton
          label={t("form.ageIncrease")}
          isDisabled={value >= MAX_CHILD_AGE}
          onPress={() => onChange(value + 1)}
        >
          <Plus aria-hidden="true" className="size-5" />
        </StepperButton>
      </div>
      {error !== undefined ? (
        <p role="alert" className="mt-2 text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function StepperButton({
  label,
  isDisabled,
  onPress,
  children,
}: {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </Button>
  );
}
