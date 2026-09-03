import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateQuizButton } from "./GenerateQuizButton";

/**
 * The "Generate questions with AI" button (file 35, FR-AI-03).
 *
 * What is worth asserting is the three answers it has to tell apart, all of which
 * arrive on a call that did not throw: questions written, a job that failed
 * anyway, and a `409` because the lesson's quiz is published. Only the first is a
 * success, and only the third is something the admin can act on.
 */

const generateQuiz = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-api", () => ({ generateQuiz }));

const LESSON_ID = "dddddddd-0000-4000-8000-000000000001";

function renderButton(props: Record<string, unknown> = {}) {
  const onGenerated = vi.fn();
  const onError = vi.fn();
  render(
    <GenerateQuizButton
      lessonId={LESSON_ID}
      isBusy={false}
      onGenerated={onGenerated}
      onError={onError}
      {...props}
    />,
  );
  return { onGenerated, onError };
}

const click = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Generate questions with AI" }),
  );

beforeEach(() => {
  generateQuiz.mockReset();
  generateQuiz.mockResolvedValue({
    ok: true,
    data: { jobId: "job-1", status: "awaiting_review" },
  });
});

describe("what the button sends", () => {
  it("asks for four questions in both languages against this lesson", async () => {
    // Both locales always: a stored question requires `prompt` and `promptAudio`
    // in each, whatever the lesson was written in (FR-I18N-01).
    renderButton();
    click();

    await waitFor(() => expect(generateQuiz).toHaveBeenCalledTimes(1));
    expect(generateQuiz).toHaveBeenCalledWith({
      lessonId: LESSON_ID,
      count: 4,
      languages: ["en", "bn"],
    });
  });

  it("sends nothing about the grade or the material — the lesson supplies both", async () => {
    renderButton();
    click();

    await waitFor(() => expect(generateQuiz).toHaveBeenCalled());
    const body = generateQuiz.mock.calls[0][0];
    expect(body).not.toHaveProperty("gradeLevel");
    expect(body).not.toHaveProperty("gradeLevels");
  });

  it("does not fire while the screen is busy with something else", () => {
    renderButton({ isBusy: true });

    expect(
      screen.getByRole("button", { name: "Generate questions with AI" }),
    ).toBeDisabled();
    click();

    expect(generateQuiz).not.toHaveBeenCalled();
  });
});

describe("what the button does with the answer", () => {
  it("reports the draft questions and how many landed", async () => {
    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("4 draft questions");
    expect(onGenerated.mock.calls[0][0]).toContain("review queue");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed job as a failure, naming it so it can be found", async () => {
    generateQuiz.mockResolvedValue({
      ok: true,
      data: { jobId: "job-9", status: "failed" },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toContain("job-9");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("passes the published-quiz refusal through, so the admin knows to withdraw it", async () => {
    // The one `409` this button expects: a generated question would be live the
    // instant it landed, because a question has no status of its own (FR-AI-07).
    generateQuiz.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Unpublish the lesson's quiz before generating questions",
        details: { code: "QUIZ_PUBLISHED" },
      },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toContain("Unpublish");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("carries the wait in its own label rather than a spinner", async () => {
    let release: (value: unknown) => void = () => {};
    generateQuiz.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderButton();
    click();

    expect(
      await screen.findByRole("button", {
        name: "Writing — this takes a moment…",
      }),
    ).toBeDisabled();

    release({ ok: true, data: { jobId: "job-1", status: "awaiting_review" } });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate questions with AI" }),
      ).toBeEnabled(),
    );
  });
});
