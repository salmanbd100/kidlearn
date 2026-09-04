import type { AiJobDetail } from "@kidlearn/types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiJobDetailScreen } from "./AiJobDetailScreen";

// The review screen's three decisions (file 37, FR-AI-07, FR-CMS-05..06).

const api = vi.hoisted(() => ({
  fetchAiJob: vi.fn(),
  approveAiJob: vi.fn(),
  rejectAiJob: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => api);

const JOB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const QUIZ_ID = "bbbbbbbb-0000-4000-8000-000000000001";

const JOB: AiJobDetail = {
  id: JOB_ID,
  type: "lesson",
  status: "awaiting_review",
  decision: null,
  gradeLevels: ["KG1"],
  languages: ["en", "bn"],
  entityLabel: "The letter A",
  createdAt: "2026-09-01T09:00:00.000Z",
  reviewedAt: null,
  updatedAt: "2026-09-01T09:00:00.000Z",
  input: { lessonFocus: "The letter A" },
  rawOutput: { attempts: [{ attempt: 1 }] },
  reviewerId: null,
  reviewNote: null,
  entities: [
    {
      resource: "lessons",
      id: "cccccccc-0000-4000-8000-000000000001",
      label: "The letter A",
      status: "draft",
    },
    {
      resource: "quizzes",
      id: QUIZ_ID,
      label: "The letter A",
      status: "draft",
    },
  ],
  assets: [],
  blockers: [],
};

function withJob(overrides: Partial<AiJobDetail> = {}): AiJobDetail {
  return { ...JOB, ...overrides };
}

beforeEach(() => {
  api.fetchAiJob.mockReset();
  api.approveAiJob.mockReset();
  api.rejectAiJob.mockReset();
  api.fetchAiJob.mockResolvedValue({ ok: true, data: JOB });
});

describe("AiJobDetailScreen", () => {
  it("shows what the job created and the status each row holds", async () => {
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(await screen.findByText("What it created")).toBeInTheDocument();
    expect(screen.getAllByText("Draft")).toHaveLength(2);
  });

  it("puts the audit record on the page, collapsed", async () => {
    // FR-AI-08 visibility: what the model was asked and what it said, without
    // pushing the content a reviewer came to read off the screen.
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(await screen.findByText("Request (input)")).toBeInTheDocument();
    expect(
      screen.getByText("Generation record (rawOutput)"),
    ).toBeInTheDocument();
  });

  it("carries ?jobId on the Edit deep-link", async () => {
    // What makes edit-then-approve a recorded fact rather than an intention: the
    // editor's save records the decision on this job in the same request.
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/admin/curriculum/quiz/${QUIZ_ID}?jobId=${JOB_ID}`,
    );
  });

  it("approves and reports what went live", async () => {
    api.approveAiJob.mockResolvedValue({
      ok: true,
      data: {
        job: withJob({ status: "approved", decision: "approve" }),
        publishedEntities: JOB.entities,
        rejectedEntities: [],
        attachedAssetIds: [],
      },
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve and publish" }),
    );

    await waitFor(() => expect(api.approveAiJob).toHaveBeenCalledWith(JOB_ID));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 rows are now live",
    );
  });

  it("disables approve on the server's blockers and says what they are", async () => {
    // Same computation the endpoint refuses on, so the button and the 409 cannot
    // disagree about why.
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({
        blockers: ["Question 1 still points at a generated placeholder asset."],
      }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByRole("button", { name: "Approve and publish" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Question 1");
  });

  it("reads Publish edited content once an edit has been recorded", async () => {
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({ decision: "edit_then_approve" }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByRole("button", { name: "Publish edited content" }),
    ).toBeInTheDocument();
  });

  it("rejects with the reason from the dialog", async () => {
    api.rejectAiJob.mockResolvedValue({
      ok: true,
      data: {
        job: withJob({
          status: "rejected",
          decision: "reject",
          reviewNote: "The Bangla reads as a translation.",
        }),
        publishedEntities: [],
        rejectedEntities: JOB.entities,
        attachedAssetIds: [],
      },
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    // Scoped to the dialog: Radix hides the page behind it from the
    // accessibility tree, so the page's own Reject button is no longer there.
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("What was wrong with it?"), {
      target: { value: "The Bangla reads as a translation." },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(api.rejectAiJob).toHaveBeenCalledWith(
        JOB_ID,
        "The Bangla reads as a translation.",
      ),
    );
  });

  it("does not carry a failed approve's error into the reject dialog", async () => {
    // One shared error slot meant the dialog opened showing the *approve*
    // failure, as though the rejection had already been refused.
    api.approveAiJob.mockResolvedValue({
      ok: false,
      error: { message: "This job cannot be approved yet" },
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve and publish" }),
    );
    await screen.findByText("This job cannot be approved yet");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.queryByText("This job cannot be approved yet"),
    ).not.toBeInTheDocument();
  });

  it("announces a failed rejection once, inside the dialog", async () => {
    // The same string in two live `role="alert"` regions is read out twice.
    api.rejectAiJob.mockResolvedValue({
      ok: false,
      error: { message: "This job is not awaiting review" },
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("What was wrong with it?"), {
      target: { value: "The Bangla reads as a translation." },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(
        screen.getAllByText("This job is not awaiting review"),
      ).toHaveLength(1),
    );
  });

  it("does not claim an edited job was approved before anybody approved it", async () => {
    // The editors write `edit_then_approve` the moment a reviewer saves, which is
    // before any approval. "…then approved" here would tell a second admin the
    // job was finished.
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({
        decision: "edit_then_approve",
        status: "awaiting_review",
      }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByText(/Edited by a reviewer — not yet approved/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/then approved/)).not.toBeInTheDocument();
  });

  it("says so plainly when a clip has no row to attach to", async () => {
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({
        assets: [
          {
            id: "asset-1",
            url: "https://cdn.test/clip.mp3",
            kind: "audio",
            language: "en",
            targetTable: null,
            targetId: null,
            sourceText: "The letter A",
            isAttached: false,
          },
        ],
      }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByText(/recorded no row to attach it to/),
    ).toBeInTheDocument();
  });

  it("shows the recorded reason on a job that was already rejected", async () => {
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({
        status: "rejected",
        decision: "reject",
        reviewNote: "The Bangla reads as a translation.",
        reviewedAt: "2026-09-02T09:00:00.000Z",
      }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByText(/The Bangla reads as a translation/),
    ).toBeInTheDocument();
  });

  it("offers no decision buttons on a job that has been decided", async () => {
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({ status: "approved", decision: "approve" }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByText(/This job has been decided/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and publish" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reject" }),
    ).not.toBeInTheDocument();
  });

  it("plays an unattached clip and says where approving will put it", async () => {
    // The only place a generated clip can be heard: nothing points at it yet, so
    // no lesson or story screen can play it, and approving on a filename is the
    // failure the queue exists to prevent.
    api.fetchAiJob.mockResolvedValue({
      ok: true,
      data: withJob({
        type: "audio",
        entities: [],
        assets: [
          {
            id: "asset-1",
            url: "https://cdn.example.test/clip.mp3",
            kind: "audio",
            language: "bn",
            targetTable: "LessonTranslation",
            targetId: "lesson-9",
            sourceText: "চলো A শিখি",
            isAttached: false,
          },
        ],
      }),
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(await screen.findByText(/চলো A শিখি/)).toBeInTheDocument();
    expect(
      screen.getByText(/approving writes it to LessonTranslation/),
    ).toBeInTheDocument();
  });

  it("offers a way back when the job could not be loaded", async () => {
    api.fetchAiJob.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "gone" },
    });
    render(<AiJobDetailScreen jobId={JOB_ID} />);

    expect(
      await screen.findByRole("link", { name: "Back to the queue" }),
    ).toBeInTheDocument();
  });
});
