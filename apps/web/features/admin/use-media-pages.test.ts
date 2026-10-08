import type { MediaAsset } from "@kidlearn/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMediaAssets } from "@/features/admin/media-api";
import {
  MEDIA_PAGE_SIZE,
  useMediaPages,
} from "@/features/admin/use-media-pages";

vi.mock("@/features/admin/media-api", () => ({ fetchMediaAssets: vi.fn() }));

const fetchMock = vi.mocked(fetchMediaAssets);

function assets(count: number, from = 0): MediaAsset[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `asset-${from + index}`,
    url: `https://res.cloudinary.com/test/image/upload/${from + index}.png`,
    kind: "image",
    language: null,
    createdAt: "2026-10-01T00:00:00.000Z",
  }));
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("useMediaPages", () => {
  it("offers more only after a full page", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, data: assets(3) });

    const { result } = renderHook(() => useMediaPages({ kind: "image" }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(false);
  });

  it("appends the next page from the last asset's id", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, data: assets(MEDIA_PAGE_SIZE) })
      .mockResolvedValueOnce({ ok: true, data: assets(2, MEDIA_PAGE_SIZE) });

    const { result } = renderHook(() => useMediaPages({ kind: "image" }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(fetchMock).toHaveBeenLastCalledWith({
      kind: "image",
      language: undefined,
      limit: MEDIA_PAGE_SIZE,
      before: `asset-${MEDIA_PAGE_SIZE - 1}`,
    });
    expect(result.current.assets).toHaveLength(MEDIA_PAGE_SIZE + 2);
    expect(result.current.hasMore).toBe(false);
  });

  it("drops an older page that lands after the filters changed", async () => {
    let resolveOlder: (value: { ok: true; data: MediaAsset[] }) => void =
      () => {};
    fetchMock
      .mockResolvedValueOnce({ ok: true, data: assets(MEDIA_PAGE_SIZE) })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
      )
      .mockResolvedValueOnce({ ok: true, data: assets(1, 500) });

    const { result, rerender } = renderHook(
      ({ language }: { language?: "en" | "bn" }) =>
        useMediaPages({ kind: "audio", language }),
      { initialProps: {} },
    );
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    let older: Promise<void> = Promise.resolve();
    act(() => {
      older = result.current.loadMore();
    });
    rerender({ language: "bn" });
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await act(async () => {
      resolveOlder({ ok: true, data: assets(5, 900) });
      await older;
    });

    expect(result.current.assets.map((asset) => asset.id)).toEqual([
      "asset-500",
    ]);
  });

  it("fetches nothing while disabled", () => {
    renderHook(() => useMediaPages({}, { isEnabled: false }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
