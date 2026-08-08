import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { PIN_LENGTH, PinPad } from "./PinPad";

function renderPad(ui: React.ReactNode) {
  return render(<Providers locale="en">{ui}</Providers>);
}

/** Drives the pad the way the real callers do, so `value` reflects the taps. */
function ControlledPad({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PinPad
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function tapDigits(digits: string) {
  for (const digit of digits) {
    fireEvent.click(screen.getByRole("button", { name: `Digit ${digit}` }));
  }
}

/** How many dots are currently filled, read off the styling rather than state. */
function filledDotCount(): number {
  return document.querySelectorAll(".bg-primary").length;
}

describe("PinPad", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("builds the value one digit at a time", () => {
    const onChange = vi.fn();
    renderPad(<ControlledPad onChange={onChange} />);

    tapDigits("48");

    expect(onChange.mock.calls.map(([next]) => next)).toEqual(["4", "48"]);
  });

  it("masks the entry — the digits never appear on screen as text", () => {
    renderPad(<ControlledPad />);

    tapDigits("4821");

    // Each digit is on its own key, so the only way to check the *entry* is
    // masked is that no element renders the assembled PIN.
    expect(screen.queryByText("4821")).toBeNull();
    expect(filledDotCount()).toBe(PIN_LENGTH);
  });

  it("fills one dot per entered digit", () => {
    renderPad(<ControlledPad />);
    expect(filledDotCount()).toBe(0);

    tapDigits("4");
    expect(filledDotCount()).toBe(1);

    tapDigits("8");
    expect(filledDotCount()).toBe(2);
  });

  it("announces how many digits are entered, since dots are not readable", () => {
    renderPad(<ControlledPad />);

    expect(screen.getByText("0 of 4 digits entered")).toBeInTheDocument();

    tapDigits("48");

    expect(screen.getByText("2 of 4 digits entered")).toBeInTheDocument();
  });

  it("stops at four digits instead of truncating a fifth", () => {
    const onChange = vi.fn();
    renderPad(<ControlledPad onChange={onChange} />);

    tapDigits("48219");

    expect(onChange).toHaveBeenCalledTimes(PIN_LENGTH);
    expect(onChange).toHaveBeenLastCalledWith("4821");
  });

  it("removes the last digit on backspace", () => {
    const onChange = vi.fn();
    renderPad(<ControlledPad initial="482" onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Delete the last digit" }),
    );

    expect(onChange).toHaveBeenCalledWith("48");
  });

  it("disables backspace when there is nothing to delete", () => {
    renderPad(<ControlledPad />);

    expect(
      screen.getByRole("button", { name: "Delete the last digit" }),
    ).toBeDisabled();
  });

  it("ignores every key while disabled", () => {
    const onChange = vi.fn();
    render(
      <Providers locale="en">
        <PinPad value="48" onChange={onChange} isDisabled />
      </Providers>,
    );

    tapDigits("1");
    fireEvent.click(
      screen.getByRole("button", { name: "Delete the last digit" }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an error as an alert so it is announced, not just coloured", () => {
    render(
      <Providers locale="en">
        <PinPad value="" onChange={vi.fn()} error="That PIN is not right." />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That PIN is not right.",
    );
  });

  it("keeps every key at the 64px touch target with a visible focus ring", () => {
    renderPad(<ControlledPad />);

    const key = screen.getByRole("button", { name: "Digit 5" });
    expect(key).toHaveClass("size-16");
    expect(key).toHaveClass("focus-visible:ring-2", "focus-visible:ring-ring");
  });

  it("labels its keys in Bangla too, so the gate is usable in either locale", () => {
    render(
      <Providers locale="bn">
        <ControlledPad />
      </Providers>,
    );

    // The label is translated; the numeral is not. A key showing "৭" that
    // contributes "7" to the PIN would make the masked confirmation entry a
    // guessing game, and the digit a parent has to remember is the one the server
    // stores.
    expect(screen.getByRole("button", { name: "সংখ্যা 7" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "শেষ সংখ্যাটি মুছুন" }),
    ).toBeInTheDocument();
  });
});
