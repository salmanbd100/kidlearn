import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

// `isDismissable={false}` is the security-relevant half of this primitive.

function renderDialog(props: { isDismissable?: boolean; closeLabel?: string }) {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent {...props}>
        <DialogHeader>
          <DialogTitle>Enter your PIN</DialogTitle>
          <DialogDescription>Four digits.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>,
  );
  return { onOpenChange };
}

describe("DialogContent — dismissable (the default)", () => {
  it("renders a labelled close button", () => {
    renderDialog({ closeLabel: "Close" });
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onOpenChange } = renderDialog({ closeLabel: "Close" });

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("DialogContent — isDismissable={false}", () => {
  it("renders no close button", () => {
    renderDialog({ isDismissable: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ignores Escape", () => {
    // A gate that Escape dismisses is not a gate.
    const { onOpenChange } = renderDialog({ isDismissable: false });

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("stays open on a pointer press outside it", () => {
    // A child tapping the page behind the prompt must not get through.
    const { onOpenChange } = renderDialog({ isDismissable: false });

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("DialogContent accessibility", () => {
  it("takes its accessible name from the title", () => {
    renderDialog({ isDismissable: false });
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Enter your PIN");
  });

  it("keeps a description association, so the prompt is announced too", () => {
    renderDialog({ isDismissable: false });
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Four digits.",
    );
  });
});
