import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ExitConfirm } from "./ExitConfirm";

function renderConfirm(isOpen = true) {
  const onStay = vi.fn();
  const onLeave = vi.fn();
  render(
    <Providers locale="en">
      <ExitConfirm isOpen={isOpen} onStay={onStay} onLeave={onLeave} />
    </Providers>,
  );
  return { onStay, onLeave };
}

describe("ExitConfirm", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("asks before letting a child leave", () => {
    renderConfirm();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Leave the lesson?")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderConfirm(false);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers two big answers, not a small dismiss", () => {
    renderConfirm();

    // Both outcomes are equally reachable targets. A child who cannot read still
    // gets two plainly different buttons rather than one and a tiny X.
    expect(screen.getByRole("button", { name: "Stay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  it("says the place is saved, because it is", () => {
    renderConfirm();

    expect(
      screen.getByText("We saved your place. You can come back!"),
    ).toBeInTheDocument();
  });

  it("Stay resumes and leaves nothing behind", () => {
    const { onStay, onLeave } = renderConfirm();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("Leave asks the caller to navigate", () => {
    const { onStay, onLeave } = renderConfirm();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onStay).not.toHaveBeenCalled();
  });

  it("gives the primitive's close button a real name, and makes it mean stay", () => {
    const { onStay, onLeave } = renderConfirm();

    // The primitive renders this whenever the dialog is dismissable. Unnamed, it
    // would be a control a screen reader cannot describe on the one dialog a child
    // has to answer — and it must not be a third outcome.
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("treats Escape as staying — the accidental outcome is the harmless one", () => {
    const { onStay, onLeave } = renderConfirm();

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
