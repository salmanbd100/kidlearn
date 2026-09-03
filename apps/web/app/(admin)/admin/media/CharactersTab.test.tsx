import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CharactersTab } from "./CharactersTab";

/**
 * The Characters tab (file 36, FR-AI-09).
 *
 * What is worth asserting is the three things an admin can get wrong about a
 * character sheet, all of which the screen has to say out loud: that a
 * two-word description is not a description an image model can use, that a
 * rewrite changes future pictures and not past ones, and that saving a story's
 * cast never overwrites a sheet that already exists.
 */

const api = vi.hoisted(() => ({
  fetchCharacterSheets: vi.fn(),
  fetchWorlds: vi.fn(),
  createCharacterSheet: vi.fn(),
  updateCharacterSheet: vi.fn(),
  promoteJobCharacters: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => api);

const WORLD_ID = "aaaaaaaa-0000-4000-8000-000000000001";

const RABBIT = {
  id: "sheet-1",
  slug: "nibbles",
  name: "Nibbles",
  worldId: WORLD_ID,
  description: "A small white rabbit with one grey ear and a red scarf.",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const LONG_DESCRIPTION =
  "A round brown owl with large round glasses and a green bow tie.";

beforeEach(() => {
  api.fetchCharacterSheets.mockReset();
  api.fetchWorlds.mockReset();
  api.createCharacterSheet.mockReset();
  api.updateCharacterSheet.mockReset();
  api.promoteJobCharacters.mockReset();

  api.fetchCharacterSheets.mockResolvedValue({ ok: true, data: [RABBIT] });
  api.fetchWorlds.mockResolvedValue({
    ok: true,
    data: [{ id: WORLD_ID, name: "Jungle" }],
  });
  api.createCharacterSheet.mockResolvedValue({
    ok: true,
    data: { ...RABBIT, id: "sheet-2", slug: "professor-hoot" },
  });
  api.updateCharacterSheet.mockResolvedValue({ ok: true, data: RABBIT });
});

async function renderTab() {
  render(<CharactersTab />);
  await waitFor(() => expect(api.fetchCharacterSheets).toHaveBeenCalled());
}

describe("the sheet list", () => {
  it("shows each character's slug and world alongside its description", async () => {
    await renderTab();

    expect(await screen.findByText("Nibbles")).toBeInTheDocument();
    expect(screen.getByText(/nibbles · Jungle/)).toBeInTheDocument();
    expect(screen.getByText(RABBIT.description)).toBeInTheDocument();
  });

  it("labels a world-less sheet as every world", async () => {
    // A narrator or a child protagonist recurs across worlds, and the
    // illustration generator applies their sheet to every story.
    api.fetchCharacterSheets.mockResolvedValue({
      ok: true,
      data: [{ ...RABBIT, worldId: null }],
    });

    await renderTab();

    expect(await screen.findByText(/every world/)).toBeInTheDocument();
  });

  it("explains why there being none is a problem", async () => {
    api.fetchCharacterSheets.mockResolvedValue({ ok: true, data: [] });

    await renderTab();

    expect(
      await screen.findByText(/comes back looking different/),
    ).toBeInTheDocument();
  });
});

describe("adding a character", () => {
  it("refuses a description too short to draw consistently from", async () => {
    // "A rabbit" gives the model nothing to be consistent about, so the form
    // says so rather than spending a round trip on a 400.
    await renderTab();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Professor Hoot" },
    });
    fireEvent.change(screen.getByLabelText("Visual description"), {
      target: { value: "An owl" },
    });

    expect(
      screen.getByRole("button", { name: "Save character" }),
    ).toBeDisabled();
  });

  it("sends the name, description and world, with an empty world as null", async () => {
    await renderTab();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Professor Hoot" },
    });
    fireEvent.change(screen.getByLabelText("Visual description"), {
      target: { value: LONG_DESCRIPTION },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save character" }));

    await waitFor(() =>
      expect(api.createCharacterSheet).toHaveBeenCalledWith({
        name: "Professor Hoot",
        description: LONG_DESCRIPTION,
        worldId: null,
      }),
    );
  });

  it("says the description now governs every picture drawn from here on", async () => {
    await renderTab();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Professor Hoot" },
    });
    fireEvent.change(screen.getByLabelText("Visual description"), {
      target: { value: LONG_DESCRIPTION },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save character" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /every picture drawn from now on/,
    );
  });
});

describe("rewriting a description", () => {
  it("sends only the description, never the slug", async () => {
    // The slug is how an import recognises a saved character, so one that could
    // change would let the same mascot be saved twice under two names.
    await renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Rewrite description" }),
    );
    fireEvent.change(screen.getByLabelText("Visual description for Nibbles"), {
      target: { value: LONG_DESCRIPTION },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateCharacterSheet).toHaveBeenCalledWith("sheet-1", {
        description: LONG_DESCRIPTION,
      }),
    );
  });

  it("warns that pictures already drawn keep the old look", async () => {
    await renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Rewrite description" }),
    );
    fireEvent.change(screen.getByLabelText("Visual description for Nibbles"), {
      target: { value: LONG_DESCRIPTION },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /already drawn keep the old look/,
    );
  });
});

describe("saving a story's cast", () => {
  it("names what it created", async () => {
    api.promoteJobCharacters.mockResolvedValue({
      ok: true,
      data: {
        created: [{ ...RABBIT, name: "Nibbles" }],
        skipped: 1,
      },
    });

    await renderTab();

    fireEvent.change(screen.getByLabelText("Story generation job id"), {
      target: { value: "job-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save as character sheets" }),
    );

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/1 saved/);
    expect(notice).toHaveTextContent(/1 already had a sheet/);
    expect(notice).toHaveTextContent(/Nibbles/);
  });

  it("says nothing was overwritten when every character already had a sheet", async () => {
    // The second story in a world describes the same mascot in different words;
    // taking the newer wording would change how it is drawn everywhere else
    // (FR-AI-09).
    api.promoteJobCharacters.mockResolvedValue({
      ok: true,
      data: { created: [], skipped: 3 },
    });

    await renderTab();

    fireEvent.change(screen.getByLabelText("Story generation job id"), {
      target: { value: "job-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save as character sheets" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /none were overwritten/,
    );
  });

  it("disables the button while the import is in flight, so it cannot be sent twice", async () => {
    // The request is un-retried and writes one row per character; a second click
    // starts a second import against the same job. The button already reads
    // `isBusy` — the bug was that this action never set it.
    let release: (value: unknown) => void = () => {};
    api.promoteJobCharacters.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    await renderTab();

    fireEvent.change(screen.getByLabelText("Story generation job id"), {
      target: { value: "job-1" },
    });
    const button = screen.getByRole("button", {
      name: "Save as character sheets",
    });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(api.promoteJobCharacters).toHaveBeenCalledTimes(1);

    release({ ok: true, data: { created: [], skipped: 1 } });
    await screen.findByRole("status");
  });

  it("surfaces a refusal as an alert rather than a notice", async () => {
    api.promoteJobCharacters.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Only a story generation describes characters",
      },
    });

    await renderTab();

    fireEvent.change(screen.getByLabelText("Story generation job id"), {
      target: { value: "job-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save as character sheets" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Only a story generation/,
    );
  });
});

describe("when the sheets cannot be loaded", () => {
  it("offers a retry rather than an empty list", async () => {
    api.fetchCharacterSheets.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL", message: "boom" },
    });

    render(<CharactersTab />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(
      within(retry.parentElement as HTMLElement).getByText(
        /could not be loaded/,
      ),
    ).toBeInTheDocument();
  });
});
