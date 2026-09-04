import type { AdminWorld } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LessonForm } from "./LessonForm";

// The lesson editor's submit path.

const WORLDS: AdminWorld[] = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    slug: "forest",
    name: "Forest",
    status: "published",
    palette: {},
    mascotAssetId: null,
    translations: { en: "Forest", bn: "বন" },
    updatedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

function renderForm(worlds = WORLDS) {
  const onSubmit = vi.fn();
  render(
    <LessonForm
      worlds={worlds}
      topicId="cccccccc-0000-4000-8000-000000000001"
      isBusy={false}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

function fillEnglishOnly() {
  fill("Slug", "letter-a");
  fill("Internal title", "Letter A");
  fireEvent.click(screen.getByRole("button", { name: "KG-1" }));
  fill("Title a child sees (English)", "Letter A");
  fill("Intro script (English)", "Say A!");
}

describe("LessonForm", () => {
  it("leaves the per-locale fields un-required, so the submit is reachable", () => {
    renderForm();

    expect(
      screen.getByLabelText("Title a child sees (Bangla)"),
    ).not.toBeRequired();
    expect(screen.getByLabelText("Intro script (Bangla)")).not.toBeRequired();
  });

  it("names the missing Bangla title and switches to that tab", () => {
    const onSubmit = renderForm();

    fillEnglishOnly();
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add the Bangla title before saving.",
    );
    expect(screen.getByRole("button", { name: "Bangla" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves on to the intro script once the title is there", () => {
    renderForm();

    fillEnglishOnly();
    fill("Title a child sees (Bangla)", "অক্ষর অ");
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add the Bangla intro script before saving.",
    );
  });

  it("submits both locales, with the optional ids nulled out", () => {
    const onSubmit = renderForm();

    fillEnglishOnly();
    fill("Title a child sees (Bangla)", "অক্ষর অ");
    fill("Intro script (Bangla)", "অ বলো!");
    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "letter-a",
        title: "Letter A",
        gradeLevels: ["KG1"],
        activityId: null,
        quizId: null,
        translations: {
          en: {
            title: "Letter A",
            introScript: "Say A!",
            videoAssetId: null,
          },
          bn: {
            title: "অক্ষর অ",
            introScript: "অ বলো!",
            videoAssetId: null,
          },
        },
      }),
    );
  });

  it("never sends a status", () => {
    const onSubmit = renderForm();

    fillEnglishOnly();
    fill("Title a child sees (Bangla)", "অক্ষর অ");
    fill("Intro script (Bangla)", "অ বলো!");
    submit();

    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("cannot be submitted with no world to point at", () => {
    renderForm([]);

    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    expect(screen.getByLabelText("World")).toBeDisabled();
  });
});
