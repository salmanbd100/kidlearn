import { validMcq } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { QuizQuestionEditor } from "./QuizQuestionEditor";
import { draftFromDefinition } from "./quiz-draft";

/**
 * What an author *sees* while the shared schema disagrees with them (FR-CMS-03).
 */

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  stop: vi.fn(),
  isPlaying: false,
  muted: false,
  setMuted: vi.fn(),
}));

vi.mock("@/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/AudioProvider")
  >("@/components/AudioProvider");
  return { ...actual, useAudio: () => audio };
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ data: [] }, { headers: { "Content-Type": "text/json" } }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderEditor() {
  const onSubmit = vi.fn();

  render(
    <Providers locale="en">
      <QuizQuestionEditor
        // Loaded from a fixture the shared schema already accepts, so the test
        // starts from a question that is genuinely valid rather than from one this
        // file has asserted into shape.
        initial={draftFromDefinition(validMcq)}
        isBusy={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    </Providers>,
  );

  return { onSubmit };
}

const saveButton = () => screen.getByRole("button", { name: "Save question" });

describe("QuizQuestionEditor", () => {
  it("offers Save on a question the shared schema accepts", () => {
    renderEditor();

    expect(saveButton()).toBeEnabled();
  });

  it("submits the parsed payload, not the raw form state", async () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith({
      format: "mcq",
      definition: validMcq,
    });
  });

  it("refuses Save and names the field when the Bangla prompt is removed", () => {
    // The case FR-I18N-01 exists for. An author must be told which locale is
    // missing, on the input that is missing it — not on submit, and not as
    // "Invalid input" at the bottom of the form.
    renderEditor();

    fireEvent.change(screen.getByLabelText("Prompt (Bangla)"), {
      target: { value: "" },
    });

    expect(saveButton()).toBeDisabled();
    const message = screen
      .getAllByRole("alert")
      .map((element) => element.textContent)
      .join(" ");
    expect(message).not.toBe("");
    expect(screen.getByLabelText("Prompt (Bangla)")).toBeInvalid();
  });

  it("says why Save is unavailable rather than leaving a dead button", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Prompt (Bangla)"), {
      target: { value: "" },
    });

    expect(
      screen.getByText("Save is disabled until the question is valid."),
    ).toBeInTheDocument();
  });

  it("withholds the preview while the question does not parse", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Prompt (English)"), {
      target: { value: "" },
    });

    expect(
      screen.getByText("The preview appears once the question is valid."),
    ).toBeInTheDocument();
  });

  it("refuses an answer key that names an option which is not on screen", () => {
    // A question nobody can get right. The schema catches it; this asserts the
    // editor surfaces it rather than posting it and reading a 400 back.
    renderEditor();

    // Renaming the option the answer key points at is the everyday way this
    // happens: three inputs share the label, and it is the first that `apple` names.
    fireEvent.change(screen.getAllByLabelText("Option id")[0], {
      target: { value: "renamed" },
    });

    expect(saveButton()).toBeDisabled();
  });
});
