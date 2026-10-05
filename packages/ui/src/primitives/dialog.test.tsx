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

type DismissableProps =
  | { isDismissable?: true; closeLabel: string; closeSize?: "default" | "kid" }
  | { isDismissable: false; closeLabel?: never };

function renderDialog(
  props: DismissableProps & Partial<React.ComponentProps<typeof DialogContent>>,
) {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent {...props}>
        <DialogHeader>
          <DialogTitle>Confirm your choice</DialogTitle>
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

  it("keeps the close button at the parent surface's 44px floor by default", () => {
    renderDialog({ closeLabel: "Close" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "size-11",
    );
  });

  it("grows the close button to the 64px kid floor on request", () => {
    renderDialog({ closeLabel: "Close", closeSize: "kid" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "size-16",
    );
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

describe("DialogContent — a caller's own handlers", () => {
  it("cannot reopen a gate by passing onEscapeKeyDown", () => {
    // `{...props}` used to be spread after the guard, so any handler a caller
    // passed replaced it and Escape dismissed the gate again.
    const onEscapeKeyDown = vi.fn();
    const { onOpenChange } = renderDialog({
      isDismissable: false,
      onEscapeKeyDown,
    });

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onEscapeKeyDown).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still runs on a dismissable dialog", () => {
    const onEscapeKeyDown = vi.fn();
    renderDialog({ closeLabel: "Close", onEscapeKeyDown });

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onEscapeKeyDown).toHaveBeenCalled();
  });
});

describe("DialogContent accessibility", () => {
  it("takes its accessible name from the title", () => {
    renderDialog({ isDismissable: false });
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Confirm your choice",
    );
  });

  it("keeps a description association, so the prompt is announced too", () => {
    renderDialog({ isDismissable: false });
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Four digits.",
    );
  });
});
