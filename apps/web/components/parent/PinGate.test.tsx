import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { ApiResult } from "@/lib/api-client";
import { resetI18nForTests } from "@/lib/i18n";

const gate = vi.hoisted(() => ({ unlock: vi.fn(), relock: vi.fn() }));
const api = vi.hoisted(() => ({ verifyPin: vi.fn() }));

// The gate reads only `unlock` from the context, so the provider (which fetches)
// is replaced rather than mounted.
vi.mock("@/app/(parent)/context/parent-session", () => ({
  useParentGate: () => ({ isLocked: true, ...gate }),
}));

vi.mock("@/lib/parent-api", () => ({ verifyPin: api.verifyPin }));

const { PinGate } = await import("./PinGate");

const GRANTED_UNTIL = "2026-08-09T12:15:00.000Z";

function grant(): ApiResult<{ pinVerifiedUntil: string }> {
  return { ok: true, data: { pinVerifiedUntil: GRANTED_UNTIL } };
}

function renderGate(locale: "en" | "bn" = "en") {
  return render(
    <Providers locale={locale}>
      <p>parent dashboard</p>
      <PinGate />
    </Providers>,
  );
}

function tapDigits(digits: string) {
  for (const digit of digits) {
    fireEvent.click(screen.getByRole("button", { name: `Digit ${digit}` }));
  }
}

describe("PinGate", () => {
  beforeEach(() => {
    resetI18nForTests();
    gate.unlock.mockReset();
    gate.relock.mockReset();
    api.verifyPin.mockReset();
    api.verifyPin.mockResolvedValue(grant());
  });

  it("renders a modal dialog with the numpad", () => {
    renderGate();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Enter your parent PIN");
    expect(screen.getByRole("button", { name: "Digit 1" })).toBeInTheDocument();
  });

  it("cannot be dismissed — no close button, and Escape does nothing", () => {
    renderGate();

    // A gate a child can tap past is not a gate (design.md §1.2, §7).
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("verifies on the fourth digit without a separate confirm tap", async () => {
    renderGate();

    tapDigits("4821");

    await waitFor(() => expect(api.verifyPin).toHaveBeenCalledWith("4821"));
    expect(api.verifyPin).toHaveBeenCalledOnce();
  });

  it("does not call the API before the fourth digit", () => {
    renderGate();

    tapDigits("482");

    expect(api.verifyPin).not.toHaveBeenCalled();
  });

  it("unlocks with the server's expiry, storing nothing of its own", async () => {
    renderGate();

    tapDigits("4821");

    // The grant is the server's session row; the client is told only when it
    // lapses, which is what lets the provider shut the gate again on time.
    await waitFor(() =>
      expect(gate.unlock).toHaveBeenCalledWith(GRANTED_UNTIL),
    );
  });

  it("shows the wrong-PIN message and clears the entry", async () => {
    api.verifyPin.mockResolvedValue({
      ok: false,
      error: { code: "PIN_INVALID", message: "Incorrect PIN", status: 403 },
    });
    renderGate();

    tapDigits("1111");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That PIN is not right. Please try again.",
      ),
    );
    expect(gate.unlock).not.toHaveBeenCalled();
    expect(screen.getByText("0 of 4 digits entered")).toBeInTheDocument();
  });

  it("distinguishes a locked-out account from a wrong PIN", async () => {
    api.verifyPin.mockResolvedValue({
      ok: false,
      error: { code: "PIN_LOCKED", message: "Too many attempts", status: 429 },
    });
    renderGate();

    tapDigits("1111");

    // Different code, different screen: one says try again, the other says stop.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many tries. Please wait a short while before trying again.",
      ),
    );
  });

  it("sends a parent with no PIN to setup rather than showing a wrong-PIN error", async () => {
    api.verifyPin.mockResolvedValue({
      ok: false,
      error: {
        code: "PIN_REQUIRED",
        message: "No parental PIN is set",
        status: 403,
      },
    });
    renderGate();

    tapDigits("4821");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This account has no PIN yet. Let's set one up.",
      ),
    );
  });

  it("leaves the page underneath mounted, so nothing in progress is lost", () => {
    renderGate();

    expect(screen.getByText("parent dashboard")).toBeInTheDocument();
  });

  it("prompts in Bangla when that is the interface language", () => {
    renderGate("bn");

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "আপনার অভিভাবক পিন লিখুন",
    );
  });
});
