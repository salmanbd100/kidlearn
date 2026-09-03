import type { AdminWorld } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateStoryDialog } from "./GenerateStoryDialog";

/**
 * The AI Story Generator's form (file 35, FR-AI-02).
 *
 * The claims worth testing here are the ones a reviewer cannot see from the
 * markup: that the request carries exactly the admin's choices, that grade levels
 * are a set in a stable order however they were clicked, that a story cannot be
 * asked for without a world to set it in, and that a `failed` job is reported as a
 * failure even though the HTTP call succeeded.
 */

const generateStory = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-api", () => ({ generateStory }));

const WORLD_ID = "cccccccc-0000-4000-8000-000000000001";
const OTHER_WORLD_ID = "cccccccc-0000-4000-8000-000000000002";

const WORLDS: AdminWorld[] = [
  {
    id: WORLD_ID,
    slug: "jungle",
    name: "Jungle",
    status: "published",
    palette: {},
    mascotAssetId: null,
    translations: { en: "Jungle", bn: "জঙ্গল" },
    updatedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: OTHER_WORLD_ID,
    slug: "ocean",
    name: "Ocean",
    status: "published",
    palette: {},
    mascotAssetId: null,
    translations: { en: "Ocean", bn: "সমুদ্র" },
    updatedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

function renderDialog(props: Record<string, unknown> = {}) {
  const onGenerated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GenerateStoryDialog
      isOpen
      onOpenChange={onOpenChange}
      worlds={WORLDS}
      onGenerated={onGenerated}
      {...props}
    />,
  );
  return { onGenerated, onOpenChange };
}

const theme = (value: string) =>
  fireEvent.change(screen.getByLabelText("What should the story teach?"), {
    target: { value },
  });

const world = (value: string) =>
  fireEvent.change(screen.getByLabelText("World"), { target: { value } });

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));

beforeEach(() => {
  generateStory.mockReset();
  generateStory.mockResolvedValue({
    ok: true,
    data: { jobId: "job-1", status: "awaiting_review" },
  });
});

describe("what the dialog sends", () => {
  it("carries the theme, the world, the grades, both languages and the page count", async () => {
    renderDialog();
    theme("Sharing toys makes playing more fun");
    world(WORLD_ID);
    submit();

    await waitFor(() => expect(generateStory).toHaveBeenCalledTimes(1));
    expect(generateStory).toHaveBeenCalledWith({
      gradeLevels: ["KG1"],
      theme: "Sharing toys makes playing more fun",
      worldId: WORLD_ID,
      languages: ["en", "bn"],
      pageCount: 7,
    });
  });

  it("trims the theme, so a stray space does not become part of the slug", async () => {
    renderDialog();
    theme("  Sharing toys  ");
    world(WORLD_ID);
    submit();

    await waitFor(() => expect(generateStory).toHaveBeenCalled());
    expect(generateStory.mock.calls[0][0].theme).toBe("Sharing toys");
  });

  it("keeps grade levels in a stable order however they were toggled", async () => {
    // The same set clicked in a different order must be the same request — the
    // server stores it as `Story.gradeLevels` and an admin comparing two stories
    // should not see them differ by click order.
    renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    fireEvent.click(screen.getByRole("button", { name: "KG-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Nursery" }));
    submit();

    await waitFor(() => expect(generateStory).toHaveBeenCalled());
    expect(generateStory.mock.calls[0][0].gradeLevels).toEqual([
      "NURSERY",
      "KG1",
      "KG2",
    ]);
  });

  it("sends the page count the admin chose", async () => {
    renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    fireEvent.change(screen.getByLabelText("Pages"), {
      target: { value: "6" },
    });
    submit();

    await waitFor(() => expect(generateStory).toHaveBeenCalled());
    expect(generateStory.mock.calls[0][0].pageCount).toBe(6);
  });

  it("sends one language when the other is turned off", async () => {
    renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));
    submit();

    await waitFor(() => expect(generateStory).toHaveBeenCalled());
    expect(generateStory.mock.calls[0][0].languages).toEqual(["en"]);
  });
});

describe("what the dialog refuses to send", () => {
  it("will not submit without a world to set the story in", () => {
    // There is nothing to inherit from and no safe default: the world decides
    // whether the characters are jungle animals or sea creatures.
    renderDialog();
    theme("Sharing toys");

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    submit();

    expect(generateStory).not.toHaveBeenCalled();
  });

  it("will not submit without a theme", () => {
    renderDialog();
    world(WORLD_ID);

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    expect(generateStory).not.toHaveBeenCalled();
  });

  it("will not submit with no grade level selected", () => {
    renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    fireEvent.click(screen.getByRole("button", { name: "KG-1" }));

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/a story shown to no grade is a story nobody opens/i),
    ).toBeInTheDocument();
  });

  it("will not submit with no language selected", () => {
    renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));

    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/a story in no language is a story nobody can read/i),
    ).toBeInTheDocument();
  });
});

describe("what the dialog does with the answer", () => {
  it("closes and reports a draft sent to review", async () => {
    const { onGenerated, onOpenChange } = renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    submit();

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0]).toContain("review queue");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports a failed job as a failure, naming it so it can be found", async () => {
    // The HTTP call succeeded — a generation that could not produce valid output
    // still has a job row holding both attempts (FR-AI-08).
    generateStory.mockResolvedValue({
      ok: true,
      data: { jobId: "job-7", status: "failed" },
    });

    const { onGenerated } = renderDialog();
    theme("Sharing toys");
    world(WORLD_ID);
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("job-7");
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("shows the server's message when the request itself failed", async () => {
    generateStory.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such world" },
    });

    const { onGenerated } = renderDialog();
    theme("Sharing toys");
    world(OTHER_WORLD_ID);
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No such world");
    expect(onGenerated).not.toHaveBeenCalled();
  });
});

describe("what the dialog promises", () => {
  it("says a generated story is a draft nothing reaches a child from", () => {
    renderDialog();

    expect(
      screen.getByText(/nothing reaches a child until an admin publishes it/i),
    ).toBeInTheDocument();
  });
});
