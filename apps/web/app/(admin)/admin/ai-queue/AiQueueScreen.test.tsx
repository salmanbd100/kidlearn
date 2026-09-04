import type { AiJobSummary } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiQueueScreen } from "./AiQueueScreen";

// The review queue's list (file 37, FR-CMS-05).

const fetchAiJobs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-api", () => ({ fetchAiJobs }));

const JOB: AiJobSummary = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  type: "lesson",
  status: "awaiting_review",
  decision: null,
  gradeLevels: ["KG1"],
  languages: ["en", "bn"],
  entityLabel: "The letter A",
  createdAt: "2026-09-01T09:00:00.000Z",
  reviewedAt: null,
};

beforeEach(() => {
  fetchAiJobs.mockReset();
  fetchAiJobs.mockResolvedValue({ ok: true, data: { jobs: [JOB], total: 1 } });
});

/** The filter arguments of the most recent request. */
function lastQuery(): Record<string, unknown> {
  return fetchAiJobs.mock.calls[fetchAiJobs.mock.calls.length - 1][0];
}

describe("AiQueueScreen", () => {
  it("asks for the jobs awaiting review without being told to", async () => {
    render(<AiQueueScreen />);

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ status: "awaiting_review" }),
    );
  });

  it("ignores a response for filters the admin has already moved off", async () => {
    // Two requests in flight, the first resolving last. Without an in-flight
    // guard it wins, and the chips read "Awaiting review" above a list of
    // rejected jobs — a disagreement that never self-corrects.
    const rejectedJob: AiJobSummary = {
      ...JOB,
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      status: "rejected",
      entityLabel: "A rejected story",
    };

    const resolvers: Array<(value: unknown) => void> = [];
    fetchAiJobs.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    render(<AiQueueScreen />);
    await waitFor(() => expect(resolvers).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // The second (rejected) response lands first, then the stale first one.
    resolvers[1]({ ok: true, data: { jobs: [rejectedJob], total: 1 } });
    resolvers[0]({ ok: true, data: { jobs: [JOB], total: 1 } });

    expect(
      await screen.findByRole("link", { name: /A rejected story/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /The letter A/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("renders a job with its label, grade and languages", async () => {
    // Scoped to the row: "KG-1" is also a filter chip, and a document-wide query
    // would pass on the chip alone.
    render(<AiQueueScreen />);
    const row = await screen.findByRole("link", { name: /The letter A/ });

    expect(row).toHaveTextContent("KG-1");
    expect(row).toHaveTextContent("English, Bangla");
    expect(row).toHaveTextContent("Lesson");
  });

  it("links each row at its detail page", async () => {
    render(<AiQueueScreen />);

    expect(
      await screen.findByRole("link", { name: /The letter A/ }),
    ).toHaveAttribute("href", `/admin/ai-queue/${JOB.id}`);
  });

  it("sends the type filter to the server rather than filtering in the browser", async () => {
    // Filtering client-side would only ever narrow the current page, which is a
    // different question from "what is in the queue".
    render(<AiQueueScreen />);
    await screen.findByText("The letter A");

    fireEvent.click(screen.getByRole("button", { name: "Narration" }));

    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "audio" }));
  });

  it("sends the language and grade filters too", async () => {
    render(<AiQueueScreen />);
    await screen.findByText("The letter A");

    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ language: "bn" }));

    fireEvent.click(screen.getByRole("button", { name: "KG-2" }));
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ gradeLevel: "KG2" }),
    );
  });

  it("omits a filter entirely when it is set back to Any", async () => {
    // An empty-string parameter is a value the server's enum would reject.
    render(<AiQueueScreen />);
    await screen.findByText("The letter A");

    fireEvent.click(screen.getByRole("button", { name: "Narration" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ type: "audio" }));

    const anyChips = screen.getAllByRole("button", { name: "Any" });
    fireEvent.click(anyChips[0]);

    await waitFor(() => expect(lastQuery()).not.toHaveProperty("type"));
  });

  it("marks the selected chip with aria-pressed, not colour alone", async () => {
    render(<AiQueueScreen />);
    await screen.findByText("The letter A");

    expect(
      screen.getByRole("button", { name: "Awaiting review" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rejected" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("says the queue is empty when nothing is waiting", async () => {
    fetchAiJobs.mockResolvedValue({ ok: true, data: { jobs: [], total: 0 } });
    render(<AiQueueScreen />);

    expect(
      await screen.findByText("Nothing is waiting for review."),
    ).toBeInTheDocument();
  });

  it("explains an empty filtered list rather than calling the queue finished", async () => {
    // A grade filter excludes every narration and illustration job by
    // construction — an admin who does not know that reads an empty list as
    // "nothing to do".
    render(<AiQueueScreen />);
    await screen.findByText("The letter A");

    fetchAiJobs.mockResolvedValue({ ok: true, data: { jobs: [], total: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "KG-2" }));

    expect(
      await screen.findByText(/audio and illustration jobs carry neither/),
    ).toBeInTheDocument();
  });

  it("offers a retry when the queue could not be loaded", async () => {
    fetchAiJobs.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "no" },
    });
    render(<AiQueueScreen />);

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("labels a job that produced nothing rather than rendering a blank row", async () => {
    fetchAiJobs.mockResolvedValue({
      ok: true,
      data: {
        jobs: [{ ...JOB, status: "failed", entityLabel: null }],
        total: 1,
      },
    });
    render(<AiQueueScreen />);

    expect(await screen.findByText("Nothing was produced")).toBeInTheDocument();
  });
});
