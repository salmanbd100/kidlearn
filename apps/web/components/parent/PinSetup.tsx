"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiResult } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { pinErrorKey } from "@/lib/parent-errors";
import { PIN_LENGTH, PinPad } from "./PinPad";

/**
 * Choose a PIN, then prove you remember it (FR-AUTH-04).
 *
 * The second entry is not a formality: a PIN that was mistyped once is a parent
 * locked out of their own dashboard with no reset path short of account deletion.
 *
 * The state machine is explicit rather than a pile of booleans because the
 * mismatch case has a shape that flags cannot express — the pad has to be empty
 * *and* showing an error *and* ready to start over on the next keypress, without
 * that keypress being swallowed to clear the error.
 */

type PinSetupState =
  | { phase: "enter"; first: string }
  | { phase: "confirm"; first: string; second: string }
  | { phase: "mismatch" }
  | { phase: "submitting" };

export interface PinSetupProps {
  /** Sends the chosen PIN. Resolved failures are shown; nothing throws. */
  onSubmit: (pin: string) => Promise<ApiResult<unknown>>;
  /** Runs after `onSubmit` succeeds — advance the flow from here. */
  onComplete: () => void;
}

export function PinSetup({ onSubmit, onComplete }: PinSetupProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const [state, setState] = useState<PinSetupState>({
    phase: "enter",
    first: "",
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (pin: string) => {
    setState({ phase: "submitting" });
    setServerError(null);

    const result = await onSubmit(pin);
    if (result.ok) {
      onComplete();
      return;
    }

    // Back to the top: the PIN was never stored, so confirming it would confirm
    // nothing. `pinErrorKey` maps the code — never the server's message.
    setServerError(t(pinErrorKey(result.error)));
    setState({ phase: "enter", first: "" });
  };

  const handleChange = (next: string) => {
    if (state.phase === "submitting") return;

    // A keypress after a mismatch starts the first entry over, carrying the digit
    // rather than eating it to clear the error.
    if (state.phase === "mismatch") {
      setState({ phase: "enter", first: next });
      return;
    }

    if (state.phase === "enter") {
      setServerError(null);
      if (next.length < PIN_LENGTH) {
        setState({ phase: "enter", first: next });
        return;
      }
      setState({ phase: "confirm", first: next, second: "" });
      return;
    }

    if (next.length < PIN_LENGTH) {
      setState({ ...state, second: next });
      return;
    }

    if (next === state.first) {
      void submit(next);
      return;
    }

    setState({ phase: "mismatch" });
  };

  const padValue =
    state.phase === "enter"
      ? state.first
      : state.phase === "confirm"
        ? state.second
        : "";

  const prompt =
    state.phase === "confirm"
      ? t("pin.confirmPrompt")
      : state.phase === "submitting"
        ? t("pin.checking")
        : t("pin.choosePrompt");

  const error = state.phase === "mismatch" ? t("pin.mismatch") : serverError;

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-center font-medium text-foreground">{prompt}</p>
      <PinPad
        value={padValue}
        onChange={handleChange}
        isDisabled={state.phase === "submitting"}
        error={error}
      />
    </div>
  );
}
