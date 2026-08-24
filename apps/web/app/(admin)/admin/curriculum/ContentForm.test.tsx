import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentForm } from "./ContentForm";

/**
 * The submit path, which is where the form used to fail silently.
 *
 * `LocaleTabs` keeps the inactive locale panel mounted under `hidden`, and the
 * per-locale inputs once carried `required`. A `required` control inside a
 * `display:none` subtree is still constraint-validated but cannot be focused, so
 * the browser refused the submit and reported nothing: the admin clicked "Create
 * draft" and the dialog just sat there. These assert the replacement — the form
 * checks both locales itself, says which one is missing, and switches to it.
 *
 * jsdom does not implement interactive constraint validation, so the old bug was
 * invisible to a test of this shape. What is asserted here is therefore the
 * behaviour that replaced it, not the absence of the browser's.
 */

function renderForm(
  overrides: Partial<Parameters<typeof ContentForm>[0]> = {},
) {
  const onSubmit = vi.fn();
  render(
    <ContentForm
      resource="subjects"
      isBusy={false}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
  return onSubmit;
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

const fill = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ContentForm", () => {
  it("carries no required attribute on a locale field", () => {
    renderForm();

    // The panels are both mounted, so both are queryable — and neither may be
    // `required`, which is the whole point.
    expect(
      screen.getByLabelText("Name a child sees (English)"),
    ).not.toBeRequired();
    expect(
      screen.getByLabelText("Name a child sees (Bangla)"),
    ).not.toBeRequired();
  });

  it("refuses to submit with a locale missing, and says which", () => {
    const onSubmit = renderForm();

    fill("Slug", "letters");
    fill("Internal name", "Letters");
    fill("Name a child sees (English)", "Letters");
    fireEvent.click(screen.getByRole("button", { name: "Nursery" }));

    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add the Bangla name a child sees before saving.",
    );
  });

  it("switches to the offending locale so the field is reachable", () => {
    renderForm();

    fill("Slug", "letters");
    fill("Internal name", "Letters");
    fill("Name a child sees (English)", "Letters");
    fireEvent.click(screen.getByRole("button", { name: "Nursery" }));
    submit();

    expect(screen.getByRole("button", { name: "Bangla" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Name a child sees (Bangla)")).toBeVisible();
  });

  it("submits both locales once each is filled", () => {
    const onSubmit = renderForm();

    fill("Slug", "letters");
    fill("Internal name", "Letters");
    fill("Name a child sees (English)", "Letters");
    fill("Name a child sees (Bangla)", "অক্ষর");
    fireEvent.click(screen.getByRole("button", { name: "Nursery" }));
    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "letters",
        name: "Letters",
        translations: { en: "Letters", bn: "অক্ষর" },
        gradeLevels: ["NURSERY"],
      }),
    );
  });

  it("never sends a status — publishing has one door", () => {
    const onSubmit = renderForm();

    fill("Slug", "letters");
    fill("Internal name", "Letters");
    fill("Name a child sees (English)", "Letters");
    fill("Name a child sees (Bangla)", "অক্ষর");
    fireEvent.click(screen.getByRole("button", { name: "Nursery" }));
    submit();

    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("locks the slug on edit — it is in the URL of anything published", () => {
    renderForm({
      existing: {
        id: "s1",
        slug: "letters",
        name: "Letters",
        status: "published",
        gradeLevels: ["NURSERY"],
        translations: { en: "Letters", bn: "অক্ষর" },
        sortOrder: 0,
        updatedBy: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(screen.getByLabelText("Slug")).toBeDisabled();
  });
});
