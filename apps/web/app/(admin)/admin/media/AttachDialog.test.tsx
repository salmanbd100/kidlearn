import type { AdminWorld, MediaAsset } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachDialog } from "./AttachDialog";

const api = vi.hoisted(() => ({
  fetchWorlds: vi.fn(),
  fetchLessons: vi.fn(),
  updateContent: vi.fn(),
  fetchBadges: vi.fn(),
  updateBadge: vi.fn(),
}));

vi.mock("@/features/admin/content-api", () => api);
vi.mock("@/features/admin/editors-api", () => api);

const TIMESTAMPS = {
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const IMAGE: MediaAsset = {
  id: "asset-1",
  url: "https://res.cloudinary.com/demo/image/upload/owl.png",
  kind: "image",
  language: null,
  createdAt: TIMESTAMPS.createdAt,
};

const world = (id: string, name: string, status: AdminWorld["status"]) => ({
  id,
  slug: name.toLowerCase(),
  name,
  status,
  palette: {},
  mascotAssetId: null,
  translations: { en: name, bn: name },
  updatedBy: null,
  ...TIMESTAMPS,
});

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset();
  api.fetchWorlds.mockResolvedValue({
    ok: true,
    data: [
      world("world-1", "Forest", "draft"),
      world("world-2", "Ocean", "published"),
    ],
  });
  api.fetchLessons.mockResolvedValue({ ok: true, data: [] });
  api.fetchBadges.mockResolvedValue({ ok: true, data: [] });
  api.updateContent.mockResolvedValue({ ok: true, data: {} });
});

describe("AttachDialog", () => {
  it("attaches the image to the row chosen from the dropdown", async () => {
    const onAttached = vi.fn();
    render(<AttachDialog asset={IMAGE} onAttached={onAttached} />);

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Row" }), {
      key: "Enter",
    });
    fireEvent.click(await screen.findByRole("option", { name: "Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));

    await waitFor(() =>
      expect(onAttached).toHaveBeenCalledWith("Attached to world mascot."),
    );
    expect(api.updateContent).toHaveBeenCalledWith("worlds", "world-1", {
      mascotAssetId: "asset-1",
    });
  });

  it("does not offer a published row", async () => {
    render(<AttachDialog asset={IMAGE} onAttached={vi.fn()} />);
    await waitFor(() => expect(api.fetchWorlds).toHaveBeenCalled());

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Row" }), {
      key: "Enter",
    });

    expect(
      await screen.findByRole("option", { name: "Forest" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Ocean" }),
    ).not.toBeInTheDocument();
  });

  it("will not attach before a row is chosen", () => {
    render(<AttachDialog asset={IMAGE} onAttached={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Attach" })).toBeDisabled();
  });
});
