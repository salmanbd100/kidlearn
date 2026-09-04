import type { AdminSubject, AdminTopic, AdminWorld } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateLessonDialog } from "./GenerateLessonDialog";

// The AI Lesson Generator's form (file 34, FR-AI-01).

const generateLesson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-api", () => ({ generateLesson }));

const TIMESTAMPS = {
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const SUBJECT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const TOPIC_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const WORLD_ID = "cccccccc-0000-4000-8000-000000000001";

const SUBJECTS: AdminSubject[] = [
  {
    id: SUBJECT_ID,
    slug: "english",
    name: "English",
    sortOrder: 1,
    gradeLevels: ["KG1"],
    status: "published",
    translations: { en: "English", bn: "ইংরেজি" },
    updatedBy: null,
    ...TIMESTAMPS,
  },
];

const TOPICS: AdminTopic[] = [
  {
    id: TOPIC_ID,
    subjectId: SUBJECT_ID,
    slug: "letters",
    name: "Letters",
    sortOrder: 1,
    gradeLevels: ["KG1"],
    status: "published",
    translations: { en: "Letters", bn: "অক্ষর" },
    updatedBy: null,
    ...TIMESTAMPS,
  },
];

const WORLDS: AdminWorld[] = [
  {
    id: WORLD_ID,
    slug: "forest",
    name: "Forest",
    status: "published",
    palette: {},
    mascotAssetId: null,
    translations: { en: "Forest", bn: "বন" },
    updatedBy: null,
    ...TIMESTAMPS,
  },
];

function renderDialog(props: Record<string, unknown> = {}) {
  const onGenerated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GenerateLessonDialog
      isOpen
      onOpenChange={onOpenChange}
      subjects={SUBJECTS}
      topics={TOPICS}
      worlds={WORLDS}
      subjectId={SUBJECT_ID}
      topicId={TOPIC_ID}
      onGenerated={onGenerated}
      {...props}
    />,
  );
  return { onGenerated, onOpenChange };
}

const focus = (value: string) =>
  fireEvent.change(screen.getByLabelText("What should the lesson teach?"), {
    target: { value },
  });

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));

beforeEach(() => {
  generateLesson.mockReset();
  generateLesson.mockResolvedValue({
    ok: true,
    data: { jobId: "job-1", status: "awaiting_review" },
  });
});

describe("what the dialog sends", () => {
  it("carries the tree selection, the grade and both languages", async () => {
    renderDialog();
    focus("The letter A");
    submit();

    await waitFor(() => expect(generateLesson).toHaveBeenCalledTimes(1));
    expect(generateLesson).toHaveBeenCalledWith({
      gradeLevel: "KG1",
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      lessonFocus: "The letter A",
      languages: ["en", "bn"],
    });
  });

  it("omits worldId entirely when the world is inherited", async () => {
    // Not `worldId: ""` — the server takes a uuid or nothing, and an empty string
    // is a 400 rather than the inheritance the label promises.
    renderDialog();
    focus("The letter A");
    submit();

    await waitFor(() => expect(generateLesson).toHaveBeenCalled());
    expect(generateLesson.mock.calls[0][0]).not.toHaveProperty("worldId");
  });

  it("sends the world when one is chosen", async () => {
    renderDialog();
    focus("The letter A");
    fireEvent.change(screen.getByLabelText("World"), {
      target: { value: WORLD_ID },
    });
    submit();

    await waitFor(() => expect(generateLesson).toHaveBeenCalled());
    expect(generateLesson.mock.calls[0][0].worldId).toBe(WORLD_ID);
  });

  it("keeps languages in a stable order however they were toggled", async () => {
    renderDialog();
    focus("The letter A");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    submit();

    await waitFor(() => expect(generateLesson).toHaveBeenCalled());
    expect(generateLesson.mock.calls[0][0].languages).toEqual(["en", "bn"]);
  });

  it("sends one language when the other is turned off", async () => {
    renderDialog();
    focus("The letter A");
    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));
    submit();

    await waitFor(() => expect(generateLesson).toHaveBeenCalled());
    expect(generateLesson.mock.calls[0][0].languages).toEqual(["en"]);
  });
});

describe("what the dialog refuses to send", () => {
  it("will not submit without a focus line", () => {
    renderDialog();

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    submit();

    expect(generateLesson).not.toHaveBeenCalled();
  });

  it("will not submit with no language selected", () => {
    renderDialog();
    focus("The letter A");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/a lesson in no language is a lesson nobody can read/i),
    ).toBeInTheDocument();
  });
});

describe("what the dialog does with the answer", () => {
  it("closes and reports a draft sent to review", async () => {
    const { onGenerated, onOpenChange } = renderDialog();
    focus("The letter A");
    submit();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("review queue");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports a failed job as a failure, naming it so it can be found", async () => {
    // The HTTP call succeeded — a generation that could not produce valid output
    // still has a job row holding both attempts (FR-AI-08).
    generateLesson.mockResolvedValue({
      ok: true,
      data: { jobId: "job-7", status: "failed" },
    });

    const { onGenerated } = renderDialog();
    focus("The letter A");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("job-7");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("shows the server's own message on a refusal", async () => {
    generateLesson.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message:
          "This topic has no lessons yet, so there is no world to inherit.",
      },
    });

    renderDialog();
    focus("The letter A");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("no world to inherit");
  });
});
