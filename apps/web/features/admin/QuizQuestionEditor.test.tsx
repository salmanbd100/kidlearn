import { validMcq } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { QuizQuestionEditor } from "./QuizQuestionEditor";
import { draftFromDefinition } from "./quiz-draft";

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  stop: vi.fn(),
  isPlaying: false,
  muted: false,
  setMuted: vi.fn(),
}));

vi.mock("@/shared/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/components/AudioProvider")
  >("@/shared/components/AudioProvider");
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
        // Loaded from a fixture the shared schema accepts, so the test starts valid.
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
    // The missing locale must be reported on its own input, not as "Invalid input" at the form foot.
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
    // The editor must surface an unanswerable question rather than post it for a 400.
    renderEditor();

    // Renaming the option the key points at: three inputs share the label and `apple` names the first.
    fireEvent.change(screen.getAllByLabelText("Option id")[0], {
      target: { value: "renamed" },
    });

    expect(saveButton()).toBeDisabled();
  });
});
