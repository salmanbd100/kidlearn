import type { ContentStatusValue } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransitionButtons } from "./TransitionButtons";

/**
 * Which transitions an admin is offered, per status (file 32, FR-CMS-06).
 *
 * The buttons are derived from `@kidlearn/types`, the same table the server
 * applies, so what is worth asserting is not the table again — `contentStatusService.test.ts`
 * owns all 36 cells — but that this component *renders* it faithfully: the two
 * failures possible here are offering a hop the server refuses, and hiding one it
 * would allow.
 */

function renderFor(status: ContentStatusValue) {
  const onTransition = vi.fn();
  render(
    <TransitionButtons
      status={status}
      isBusy={false}
      onTransition={onTransition}
    />,
  );
  return onTransition;
}

const labelsOnScreen = () =>
  screen
    .getAllByRole("button")
    .map((button) => button.textContent?.trim())
    .filter((label): label is string => Boolean(label));

describe("TransitionButtons", () => {
  it("offers a draft only Submit and Archive", () => {
    renderFor("draft");

    expect(labelsOnScreen()).toEqual(["Submit for review", "Archive"]);
  });

  it("offers an in-review row Approve, Reject and Back to draft", () => {
    renderFor("in_review");

    expect(labelsOnScreen()).toEqual([
      "Approve",
      "Reject",
      "Back to draft",
      // The chained shortcut, which is two validated hops rather than a special
      // one — see below.
      "Approve & publish",
    ]);
  });

  it("never offers Publish on anything but an approved row", () => {
    const statuses: ContentStatusValue[] = [
      "draft",
      "in_review",
      "rejected",
      "published",
      "archived",
    ];

    for (const status of statuses) {
      const { unmount } = render(
        <TransitionButtons
          status={status}
          isBusy={false}
          onTransition={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
      unmount();
    }

    renderFor("approved");
    expect(screen.getByRole("button", { name: "Publish" })).toBeVisible();
  });

  it("offers a rejected row no route back to review", () => {
    renderFor("rejected");

    // Rejected work is reworked and re-reviewed, never un-rejected (FR-CMS-06).
    expect(labelsOnScreen()).toEqual(["Back to draft", "Archive"]);
  });

  it("offers a published row unpublish and archive, and nothing else", () => {
    renderFor("published");

    expect(labelsOnScreen()).toEqual(["Back to draft", "Archive"]);
  });

  it("offers an archived row only restore", () => {
    renderFor("archived");

    expect(labelsOnScreen()).toEqual(["Back to draft"]);
  });

  it("sends approve and publish as two hops, in order", () => {
    const onTransition = renderFor("in_review");

    fireEvent.click(screen.getByRole("button", { name: "Approve & publish" }));

    // Not a single `in_review → published` request: no such hop exists, and
    // adding one would be adding a way to publish with no approval on the record.
    expect(onTransition).toHaveBeenCalledWith(["approved", "published"]);
  });

  it("disables every button while a transition is in flight", () => {
    render(<TransitionButtons status="draft" isBusy onTransition={vi.fn()} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
