"use client";

import { cn } from "@kidlearn/ui";
import { Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";

/**
 * The four-digit numpad. Presentational and fully controlled — it owns no state,
 * decides nothing, and never talks to the API, which is what makes both the setup
 * flow and the gate able to reuse it and what makes it testable in isolation.
 *
 * Design constraints it exists to satisfy:
 *
 *  - The parental gate "must be genuinely hard for a pre-reader" (design.md §7):
 *    reading and typing digits, never a "tap to continue".
 *  - Keys are 64px — comfortably past the 44px parent minimum — because this is
 *    the one parent control most likely to be used one-handed while holding a
 *    tablet.
 *  - The entry is masked, and the count of entered digits is announced through a
 *    live region rather than left to the dots, which a screen reader cannot read.
 */

export const PIN_LENGTH = 4;

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/** One stable key per masked dot, so the row needs no array-index keys. */
const DOT_POSITIONS = ["first", "second", "third", "fourth"] as const;

export interface PinPadProps {
  /** `""` through four digits. Anything longer is ignored, not truncated. */
  value: string;
  onChange: (next: string) => void;
  isDisabled?: boolean;
  /** An already-localized message. `null`/absent renders no error. */
  error?: string | null;
}

export function PinPad({
  value,
  onChange,
  isDisabled = false,
  error,
}: PinPadProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  const appendDigit = (digit: string) => {
    if (value.length >= PIN_LENGTH) return;
    onChange(value + digit);
  };

  const removeLastDigit = () => {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* The dots are decoration; the live region below is the announcement. */}
      <div aria-hidden="true" className="flex items-center gap-3">
        {DOT_POSITIONS.map((position, index) => (
          <span
            // The position, not the array index: these dots are a fixed-length
            // list of stable slots, so the position *is* the identity.
            key={position}
            className={cn(
              "size-4 rounded-pill border-2 transition-colors",
              index < value.length
                ? "border-primary bg-primary"
                : "border-input bg-transparent",
              error ? "border-destructive" : undefined,
            )}
          />
        ))}
      </div>
      <span aria-live="polite" className="sr-only">
        {t("pin.entered", { filled: value.length, length: PIN_LENGTH })}
      </span>

      {error ? (
        // Paired with an icon-free but explicitly coloured message: meaning is
        // never carried by colour alone (design.md §2.3), the text says it too.
        <p role="alert" className="text-center text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {DIGIT_KEYS.map((digit) => (
          <PinKey
            key={digit}
            label={t("pin.digit", { digit })}
            isDisabled={isDisabled}
            // The last row is `0` centred, so `0` takes the middle column and the
            // backspace key sits to its right.
            className={digit === "0" ? "col-start-2" : undefined}
            onPress={() => appendDigit(digit)}
          >
            {digit}
          </PinKey>
        ))}
        <PinKey
          label={t("pin.backspace")}
          isDisabled={isDisabled || value.length === 0}
          onPress={removeLastDigit}
        >
          <Delete aria-hidden="true" className="size-6" />
        </PinKey>
      </div>
    </div>
  );
}

/**
 * One key. Not the shared `Button` primitive: its `size` scale tops out at a
 * 56px `xl` and none of its variants is a 64px square, and `frontend.md` is
 * explicit that a caller must not pass a `className` to restyle a primitive into
 * something its variants do not cover. A local, private element is the honest
 * alternative — this is a numpad key, not a button anyone else will want.
 */
function PinKey({
  children,
  label,
  isDisabled,
  className,
  onPress,
}: {
  children: React.ReactNode;
  label: string;
  isDisabled: boolean;
  className?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={isDisabled}
      onClick={onPress}
      className={cn(
        "inline-flex size-16 items-center justify-center rounded-[var(--radius)] border-2 border-border bg-card font-semibold text-foreground text-xl [touch-action:manipulation] transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
