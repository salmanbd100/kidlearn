import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The screen's two message channels.
 *
 * **Success and failure were one variable.** `notice` held both and was passed to
 * the open form as its `error`, so the last success was still in it when the next
 * dialog opened: creating a subject and then clicking **New** rendered "Created
 * as a draft." as a red `role="alert"` on an untouched form. They are two states
 * now, cleared together whenever a dialog opens.
 *
 * The reorder path is not exercised here. dnd-kit's collision maths needs a real
 * layout and jsdom reports every element as 0×0, so a drop cannot be simulated
 * without asserting against a mock of the library rather than the behaviour. What
 * a reorder sends is covered where it is observable — `lib/admin-api.test.ts` on
 * the request body, and `routes/admin/content.test.ts` on the server's reading of
 * it.
 */

const api = vi.hoisted(() => ({
  fetchWorlds: vi.fn(),
  fetchSubjects: vi.fn(),
  fetchTopics: vi.fn(),
  fetchLessons: vi.fn(),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  transitionContent: vi.fn(),
  reorderContent: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => api);

const { CurriculumScreen } = await import("./CurriculumScreen");

const SUBJECT = {
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  slug: "letters",
  name: "Letters",
  status: "draft" as const,
  gradeLevels: ["NURSERY" as const],
  translations: { en: "Letters", bn: "অক্ষর" },
  sortOrder: 0,
  updatedBy: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (message: string) => ({
  ok: false as const,
  error: { message, code: "CONFLICT" },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchWorlds.mockResolvedValue(ok([]));
  api.fetchSubjects.mockResolvedValue(ok([SUBJECT]));
  api.fetchTopics.mockResolvedValue(ok([]));
  api.fetchLessons.mockResolvedValue(ok([]));
});

async function renderScreen() {
  render(<CurriculumScreen />);
  await screen.findByRole("button", { name: /^Letters/ });
}

/**
 * The screen's own status banner.
 *
 * `getByRole("status")` is ambiguous here: dnd-kit mounts an empty live region
 * with the same role per `DndContext`, one per column. The banner is the only one
 * that ever carries text.
 */
function banner(): HTMLElement | undefined {
  return screen
    .queryAllByRole("status")
    .find((element) => (element.textContent ?? "").trim() !== "");
}

/** The "New" button belonging to a named column. */
function newIn(column: string) {
  const heading = screen.getByRole("heading", { name: column });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section for ${column}`);
  return within(section).getByRole("button", { name: "New" });
}

function fillSubjectForm() {
  fireEvent.change(screen.getByLabelText("Slug"), {
    target: { value: "numbers" },
  });
  fireEvent.change(screen.getByLabelText("Internal name"), {
    target: { value: "Numbers" },
  });
  fireEvent.change(screen.getByLabelText("Name a child sees (English)"), {
    target: { value: "Numbers" },
  });
  fireEvent.change(screen.getByLabelText("Name a child sees (Bangla)"), {
    target: { value: "সংখ্যা" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Nursery" }));
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
}

describe("editing a published row", () => {
  /**
   * The button has to agree with the server, which refuses a `PATCH` on a
   * published row with a `409`. Offering an edit that cannot succeed is the
   * failure mode the shared matrix exists to prevent, and `isContentEditable` is
   * the same predicate both sides read.
   */
  async function renderWithStatus(status: string) {
    api.fetchSubjects.mockResolvedValue(ok([{ ...SUBJECT, status }]));
    await renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /^Letters/ }));
  }

  it("disables Edit and says how to proceed", async () => {
    await renderWithStatus("published");

    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(
      screen.getByText(/Published content cannot be edited/),
    ).toBeInTheDocument();
  });

  it("leaves Edit enabled at every other status", async () => {
    await renderWithStatus("approved");

    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(
      screen.queryByText(/Published content cannot be edited/),
    ).not.toBeInTheDocument();
  });

  it("offers Withdraw to draft, so the refusal has a way out on screen", async () => {
    // The hint tells an admin to withdraw; the button that does it comes from
    // the shared matrix. If `published → draft` ever left the matrix, the hint
    // would describe an action the screen does not offer.
    await renderWithStatus("published");

    expect(screen.getByRole("button", { name: /draft/i })).toBeInTheDocument();
  });
});

describe("CurriculumScreen messages", () => {
  it("reports a success as a status banner, not an alert", async () => {
    api.createContent.mockResolvedValue(ok({}));
    await renderScreen();

    fireEvent.click(newIn("Subjects"));
    fillSubjectForm();

    await waitFor(() => {
      expect(banner()).toHaveTextContent("Created as a draft.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not carry a success message into the next form", async () => {
    api.createContent.mockResolvedValue(ok({}));
    await renderScreen();

    fireEvent.click(newIn("Subjects"));
    fillSubjectForm();
    await waitFor(() => expect(banner()).toBeDefined());

    fireEvent.click(newIn("Subjects"));

    // The freshly opened form is untouched: no alert, and the banner is gone.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(banner()).toBeUndefined();
  });

  it("keeps a failed create in the form, as an alert", async () => {
    api.createContent.mockResolvedValue(fail("That slug is taken."));
    await renderScreen();

    fireEvent.click(newIn("Subjects"));
    fillSubjectForm();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That slug is taken.",
      );
    });
    expect(banner()).toBeUndefined();
    // Still open, so the admin can correct it rather than retype the lot.
    expect(screen.getByLabelText("Internal name")).toBeInTheDocument();
  });

  it("shows a failed transition as an alert on the screen itself", async () => {
    api.transitionContent.mockResolvedValue(fail("Invalid status transition"));
    await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /^Letters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid status transition",
      );
    });
  });

  it("reports a successful transition as a status banner", async () => {
    api.transitionContent.mockResolvedValue(ok({}));
    await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /^Letters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => {
      expect(banner()).toHaveTextContent("Moved to in review.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
