import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RejectDialog } from "./RejectDialog";

/** The mandatory rejection reason (file 37, FR-AI-08). */
describe("RejectDialog", () => {
  function setup(overrides: Partial<Parameters<typeof RejectDialog>[0]> = {}) {
    const onConfirm = vi.fn();
    render(
      <RejectDialog
        isOpen
        onOpenChange={vi.fn()}
        subject="The letter A"
        isBusy={false}
        onConfirm={onConfirm}
        {...overrides}
      />,
    );
    return { onConfirm };
  }

  it("names what is being rejected", () => {
    setup();

    expect(screen.getByRole("heading")).toHaveTextContent("The letter A");
  });

  it("says the content is kept rather than deleted", () => {
    // An admin who thinks Reject throws the work away hesitates over the button.
    setup();

    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
  });

  it("refuses a reason shorter than ten characters", () => {
    const { onConfirm } = setup();

    fireEvent.change(screen.getByLabelText("What was wrong with it?"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says how many more characters are needed", () => {
    // The reason a disabled button is disabled has to be readable, and the live
    // region is what carries it to a screen-reader user (design.md §2.3).
    setup();

    fireEvent.change(screen.getByLabelText("What was wrong with it?"), {
      target: { value: "bad" },
    });

    expect(screen.getByText(/7 more characters/)).toBeInTheDocument();
  });

  it("submits the trimmed reason once it is long enough", () => {
    const { onConfirm } = setup();

    fireEvent.change(screen.getByLabelText("What was wrong with it?"), {
      target: { value: "  The Bangla reads as a translation.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onConfirm).toHaveBeenCalledWith(
      "The Bangla reads as a translation.",
    );
  });

  it("counts the trimmed length, so whitespace cannot pass the floor", () => {
    const { onConfirm } = setup();

    fireEvent.change(screen.getByLabelText("What was wrong with it?"), {
      target: { value: "no        " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not submit twice while a rejection is in flight", () => {
    const { onConfirm } = setup({ isBusy: true });

    fireEvent.change(screen.getByLabelText("What was wrong with it?"), {
      target: { value: "The Bangla reads as a translation." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rejecting…" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the server's refusal without discarding what was typed", () => {
    setup({ error: "This job is not awaiting review" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This job is not awaiting review",
    );
  });
});
