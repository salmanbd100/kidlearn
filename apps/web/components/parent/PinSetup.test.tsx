import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { ApiResult } from "@/lib/api-client";
import { resetI18nForTests } from "@/lib/i18n";
import { PinSetup } from "./PinSetup";

const ok: ApiResult<{ hasPin: true }> = { ok: true, data: { hasPin: true } };

function renderSetup(
  onSubmit: (pin: string) => Promise<ApiResult<unknown>> = async () => ok,
  onComplete = vi.fn(),
) {
  render(
    <Providers locale="en">
      <PinSetup onSubmit={onSubmit} onComplete={onComplete} />
    </Providers>,
  );
  return { onComplete };
}

function tapDigits(digits: string) {
  for (const digit of digits) {
    fireEvent.click(screen.getByRole("button", { name: `Digit ${digit}` }));
  }
}

describe("PinSetup", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("asks for the PIN a second time once four digits are entered", async () => {
    renderSetup();
    expect(screen.getByText("Choose your PIN")).toBeInTheDocument();

    tapDigits("4821");

    await waitFor(() =>
      expect(screen.getByText("Enter it once more")).toBeInTheDocument(),
    );
    // The confirmation entry starts empty rather than carrying the first one over.
    expect(screen.getByText("0 of 4 digits entered")).toBeInTheDocument();
  });

  it("submits the PIN once both entries match", async () => {
    const onSubmit = vi.fn(async () => ok);
    const { onComplete } = renderSetup(onSubmit);

    tapDigits("4821");
    tapDigits("4821");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("4821"));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not submit a mismatched pair — it clears and says so", async () => {
    const onSubmit = vi.fn(async () => ok);
    renderSetup(onSubmit);

    tapDigits("4821");
    tapDigits("4822");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Those two PINs did not match. Let's start again.",
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    // Back to an empty first entry, not to a half-filled confirmation.
    expect(screen.getByText("Choose your PIN")).toBeInTheDocument();
    expect(screen.getByText("0 of 4 digits entered")).toBeInTheDocument();
  });

  it("counts the keypress that follows a mismatch instead of eating it", async () => {
    renderSetup();

    tapDigits("4821");
    tapDigits("4822");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    tapDigits("7");

    // The digit landed, and the error cleared with it.
    expect(screen.getByText("1 of 4 digits entered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("returns to the first entry when the server rejects the PIN", async () => {
    const onSubmit = vi.fn(
      async (): Promise<ApiResult<unknown>> => ({
        ok: false,
        error: { code: "PIN_LOCKED", message: "developer hint", status: 429 },
      }),
    );
    const { onComplete } = renderSetup(onSubmit);

    tapDigits("4821");
    tapDigits("4821");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many tries. Please wait a short while before trying again.",
      ),
    );
    // The message is ours, keyed on `error.code` — never the server's wording.
    expect(screen.queryByText("developer hint")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText("Choose your PIN")).toBeInTheDocument();
  });

  it("locks the pad while the PIN is in flight, so it cannot be sent twice", async () => {
    let release: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<ApiResult<unknown>>((resolve) => {
          release = () => resolve(ok);
        }),
    );
    renderSetup(onSubmit);

    tapDigits("4821");
    tapDigits("4821");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Digit 1" })).toBeDisabled(),
    );
    expect(screen.getByText("Checking…")).toBeInTheDocument();

    release?.();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });
});
