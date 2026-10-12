import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusSimulator } from "./StatusSimulator";

describe("StatusSimulator", () => {
  it("walks a draft to published with the CMS's own buttons", () => {
    render(<StatusSimulator />);

    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getByText("Cannot see it")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(
      screen.getByText("Locked — back to draft first"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve & publish" }));
    expect(screen.getByText("Can see it")).toBeInTheDocument();
    expect(
      screen.getByText("Draft → In review → Approved → Published"),
    ).toBeInTheDocument();
  });

  it("offers no route from rejected straight to published", () => {
    render(<StatusSimulator />);

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(
      screen.queryByRole("button", { name: /publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to draft" }),
    ).toBeInTheDocument();
  });

  it("keeps keyboard focus on the row when the pressed button goes away", () => {
    render(<StatusSimulator />);

    const submit = screen.getByRole("button", { name: "Submit for review" });
    submit.focus();
    fireEvent.click(submit);

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveTextContent("The letter A");
  });

  it("starts again from draft", () => {
    render(<StatusSimulator />);

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeDisabled();
  });
});
