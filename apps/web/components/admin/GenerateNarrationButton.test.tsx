import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateNarrationButton } from "./GenerateNarrationButton";

/**
 * The "Generate narration" button (file 36, FR-AI-04, FR-CMS-05).
 *
 * Three things are worth asserting, and all three are about the message rather
 * than the request — the request is two fields. First, that a batch of zero jobs
 * reads as "nothing to do" rather than as a failure, because that is the ordinary
 * outcome of clicking twice and the natural reading of it is wrong. Second, that
 * `skipped` reaches the admin, or an eight-page story that produced three clips
 * looks like five silent failures. Third, that the notice says nothing is attached
 * yet — an admin who was not told that would assume the lesson now speaks.
 */

const generateNarration = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-api", () => ({ generateNarration }));

const LESSON_ID = "dddddddd-0000-4000-8000-000000000001";

function renderButton(props: Record<string, unknown> = {}) {
  const onGenerated = vi.fn();
  const onError = vi.fn();
  render(
    <GenerateNarrationButton
      entity="lesson"
      id={LESSON_ID}
      onGenerated={onGenerated}
      onError={onError}
      {...props}
    />,
  );
  return { onGenerated, onError };
}

const click = () =>
  fireEvent.click(screen.getByRole("button", { name: "Generate narration" }));

beforeEach(() => {
  generateNarration.mockReset();
  generateNarration.mockResolvedValue({
    ok: true,
    data: { jobIds: ["job-1", "job-2"], skipped: 1, failed: 0 },
  });
});

describe("what the button sends", () => {
  it("sends only the entity and its id", async () => {
    // No language: the server works out which locales have text and no audio, so
    // a picker here would let an admin ask for a clip that cannot exist.
    renderButton();
    click();

    await waitFor(() => expect(generateNarration).toHaveBeenCalledTimes(1));
    expect(generateNarration).toHaveBeenCalledWith({
      entity: "lesson",
      id: LESSON_ID,
    });
  });

  it("does not fire while the screen is busy with something else", () => {
    renderButton({ isBusy: true });

    expect(
      screen.getByRole("button", { name: "Generate narration" }),
    ).toBeDisabled();
    click();

    expect(generateNarration).not.toHaveBeenCalled();
  });

  it("carries the wait in its own label rather than a spinner", async () => {
    let release: (value: unknown) => void = () => {};
    generateNarration.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderButton();
    click();

    expect(
      await screen.findByRole("button", {
        name: "Recording — this takes a while…",
      }),
    ).toBeDisabled();

    release({ ok: true, data: { jobIds: [], skipped: 0, failed: 0 } });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate narration" }),
      ).toBeEnabled(),
    );
  });
});

describe("what the button does with the answer", () => {
  it("reports how many clips were recorded and how many were already there", async () => {
    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("2 clips recorded");
    expect(onGenerated.mock.calls[0][0]).toContain("1 skipped");
    expect(onError).not.toHaveBeenCalled();
  });

  it("says nothing is attached until the clips are approved", async () => {
    const { onGenerated } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(onGenerated.mock.calls[0][0]).toContain("AI Queue");
    expect(onGenerated.mock.calls[0][0]).toContain("nothing is attached");
  });

  it("reads an all-skipped batch as nothing to do, not as a failure", async () => {
    // Clicking twice is the ordinary case: the second click finds every pair
    // already covered by a clip in the review queue.
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: [], skipped: 4, failed: 0 },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("Nothing new to narrate");
    expect(onError).not.toHaveBeenCalled();
  });

  it("says there is no text yet when there was nothing to narrate at all", async () => {
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: [], skipped: 0, failed: 0 },
    });

    const { onGenerated } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(onGenerated.mock.calls[0][0]).toContain("no text to narrate");
  });

  it("passes a spent daily budget through as an error the admin can act on", async () => {
    generateNarration.mockResolvedValue({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Daily audio generation cap (200) reached",
        details: { bucket: "audio", cap: 200, used: 200, pending: 3 },
      },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toContain("cap (200)");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("reports a wholly failed batch as an error, not as clips recorded", async () => {
    // The batch answers 202 with the ids even when every provider call failed —
    // the jobs exist and hold their own diagnosis. Reading that as success sent
    // the admin to the queue to listen to sixteen clips that were never recorded.
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: ["job-1", "job-2"], skipped: 0, failed: 2 },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toContain("None of the 2 clips");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("counts only the clips that worked when a batch is part-successful", async () => {
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: ["job-1", "job-2", "job-3"], skipped: 0, failed: 1 },
    });

    const { onGenerated, onError } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("2 clips recorded");
    expect(onGenerated.mock.calls[0][0]).toContain("1 failed");
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not claim skipped clips already exist, since some have no text", async () => {
    // `skipped` folds three reasons together — already recorded, already queued,
    // and no text to read. A lesson whose only script is blank returns
    // `{ jobIds: [], skipped: 1 }`, and "already exist" is untrue of it.
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: [], skipped: 1, failed: 0 },
    });

    const { onGenerated } = renderButton();
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(onGenerated.mock.calls[0][0]).not.toContain("already exist");
    expect(onGenerated.mock.calls[0][0]).toContain("no text to read");
  });

  it("names the entity it was asked about in the nothing-to-do message", async () => {
    generateNarration.mockResolvedValue({
      ok: true,
      data: { jobIds: [], skipped: 2, failed: 0 },
    });

    const { onGenerated } = renderButton({ entity: "story", id: LESSON_ID });
    click();

    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    expect(onGenerated.mock.calls[0][0]).toContain("story");
  });
});
