import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getScreenTimeStatus: vi.fn() }));
vi.mock("./screen-time-api", () => api);

const { useScreenTimeGate } = await import("./use-screen-time-gate");

const allowed = {
  ok: true,
  data: { allowed: true, reason: null, windowStart: null },
};
const limitReached = {
  ok: true,
  data: { allowed: false, reason: "TIME_LIMIT_REACHED", windowStart: null },
};
const outsideWindow = {
  ok: true,
  data: { allowed: false, reason: "OUTSIDE_WINDOW", windowStart: "16:00" },
};
const unreadable = {
  ok: false,
  error: { code: "NETWORK_ERROR", message: "Could not reach the API." },
};

describe("useScreenTimeGate", () => {
  beforeEach(() => {
    api.getScreenTimeStatus.mockReset();
  });

  it("stays undefined until the first check lands", async () => {
    api.getScreenTimeStatus.mockResolvedValue(allowed);

    const { result } = renderHook(() => useScreenTimeGate());

    expect(result.current.block).toBeUndefined();
    await waitFor(() => expect(result.current.block).toBeNull());
  });

  it("reports the reason and the window start when the gate is shut", async () => {
    api.getScreenTimeStatus.mockResolvedValue(outsideWindow);

    const { result } = renderHook(() => useScreenTimeGate());

    await waitFor(() => expect(result.current.block).toBe("OUTSIDE_WINDOW"));
    expect(result.current.windowStart).toBe("16:00");
  });

  it("does not block when the status read fails — the server still enforces", async () => {
    api.getScreenTimeStatus.mockResolvedValue(unreadable);

    const { result } = renderHook(() => useScreenTimeGate());

    await waitFor(() => expect(result.current.block).toBeNull());
  });

  describe("guardStart", () => {
    it("runs the start once when the child may", async () => {
      api.getScreenTimeStatus.mockResolvedValue(allowed);
      const start = vi.fn();
      const { result } = renderHook(() => useScreenTimeGate());

      await act(() => result.current.guardStart(start));

      expect(start).toHaveBeenCalledTimes(1);
      expect(result.current.block).toBeNull();
    });

    it("re-checks and withholds the start when the allowance ran out meanwhile", async () => {
      api.getScreenTimeStatus
        .mockResolvedValueOnce(allowed)
        .mockResolvedValueOnce(limitReached);
      const start = vi.fn();
      const { result } = renderHook(() => useScreenTimeGate());
      await waitFor(() => expect(result.current.block).toBeNull());

      await act(() => result.current.guardStart(start));

      expect(start).not.toHaveBeenCalled();
      expect(result.current.block).toBe("TIME_LIMIT_REACHED");
    });

    it("starts anyway when the re-check cannot be read", async () => {
      api.getScreenTimeStatus.mockResolvedValue(unreadable);
      const start = vi.fn();
      const { result } = renderHook(() => useScreenTimeGate());

      await act(() => result.current.guardStart(start));

      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores an initial check that lands after unmount", async () => {
    let resolveCheck: (value: unknown) => void = () => {};
    api.getScreenTimeStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => useScreenTimeGate());

    unmount();
    resolveCheck(limitReached);
    await Promise.resolve();

    expect(result.current.block).toBeUndefined();
  });
});
