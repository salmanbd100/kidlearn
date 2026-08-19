import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent, useHeartbeat } from "./use-heartbeat";

const heartbeat = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("./api-client", () => ({ apiFetch: heartbeat.apiFetch }));

/**
 * jsdom's `document.visibilityState` is a getter with no setter, so a test that
 * needs a hidden tab has to redefine it. Returning the current value from a
 * mutable variable keeps the two halves — the property and the event — in the
 * order a real browser fires them.
 */
let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function heartbeatCalls(): unknown[][] {
  return heartbeat.apiFetch.mock.calls.filter(
    ([path]) => path === "/api/events/heartbeat",
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  heartbeat.apiFetch.mockReset();
  heartbeat.apiFetch.mockResolvedValue({
    ok: true,
    data: { recorded: true, minutesToday: 4 },
  });
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useHeartbeat", () => {
  it("posts one beat immediately on mount", () => {
    renderHook(() => useHeartbeat());

    expect(heartbeatCalls()).toHaveLength(1);
    // A short visit is worth its 30-second interval, not nothing.
    expect(heartbeatCalls()[0][1]).toMatchObject({
      method: "POST",
      retries: 0,
    });
  });

  it("sends no body, so nothing a client holds can reach the row", () => {
    renderHook(() => useHeartbeat());

    const init = heartbeatCalls()[0][1] as { body?: unknown };
    expect(init.body).toBeUndefined();
  });

  /**
   * The lock screen case. `/api/events/heartbeat` is deliberately never screen-time
   * gated, so a caller that keeps beating through a state where no lesson is on
   * screen would bill a child for sitting on "time's up".
   */
  it("does not beat while disabled", async () => {
    renderHook(() => useHeartbeat({ enabled: false }));

    expect(heartbeatCalls()).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(heartbeatCalls()).toHaveLength(0);
  });

  it("starts beating when enabled flips on", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHeartbeat({ enabled }),
      { initialProps: { enabled: false } },
    );
    expect(heartbeatCalls()).toHaveLength(0);

    await act(async () => {
      rerender({ enabled: true });
    });
    expect(heartbeatCalls()).toHaveLength(1);
  });

  it("stops beating when enabled flips off", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHeartbeat({ enabled }),
      { initialProps: { enabled: true } },
    );
    expect(heartbeatCalls()).toHaveLength(1);

    await act(async () => {
      rerender({ enabled: false });
    });
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(heartbeatCalls()).toHaveLength(1);
  });

  it("beats again every 30 seconds", async () => {
    renderHook(() => useHeartbeat());

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(heartbeatCalls()).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(heartbeatCalls()).toHaveLength(4);
  });

  it("reports the server's minutes rather than a locally measured elapsed time", async () => {
    const { result } = renderHook(() => useHeartbeat());

    // `null` until a beat has landed — the hook has no figure of its own to show.
    expect(result.current.minutesToday).toBe(null);

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.minutesToday).toBe(4);

    heartbeat.apiFetch.mockResolvedValue({
      ok: true,
      data: { recorded: true, minutesToday: 9 },
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.minutesToday).toBe(9);
  });

  it("keeps the last known total when a beat fails, and does not retry it", async () => {
    const { result } = renderHook(() => useHeartbeat());
    await act(async () => {
      await Promise.resolve();
    });

    heartbeat.apiFetch.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.minutesToday).toBe(4);
    // One request per tick, never two: the next tick is the retry.
    expect(heartbeatCalls()).toHaveLength(2);
  });

  it("stops beating while the tab is hidden", async () => {
    renderHook(() => useHeartbeat());
    expect(heartbeatCalls()).toHaveLength(1);

    setVisibility("hidden");
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    // A background tab has no child in front of it. Without this, a lesson left
    // open in another window would bill a whole afternoon (and file 28 would lock
    // a child out of a device they were not using).
    expect(heartbeatCalls()).toHaveLength(1);
  });

  it("resumes with an immediate beat when the tab becomes visible again", async () => {
    renderHook(() => useHeartbeat());
    setVisibility("hidden");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    setVisibility("visible");
    expect(heartbeatCalls()).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(heartbeatCalls()).toHaveLength(3);
  });

  it("does not start a second interval when already visible", async () => {
    renderHook(() => useHeartbeat());

    // A `visibilitychange` that does not change anything — some browsers fire one
    // on focus. Two intervals would double every beat from here on.
    setVisibility("visible");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(heartbeatCalls()).toHaveLength(2);
  });

  it("stops beating on unmount", async () => {
    const { unmount } = renderHook(() => useHeartbeat());
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    expect(heartbeatCalls()).toHaveLength(1);
  });
});

describe("trackEvent", () => {
  it("posts the type and refId, fire-and-forget, with no retries", () => {
    trackEvent("story_start", "story_1");

    expect(heartbeat.apiFetch).toHaveBeenCalledWith("/api/events/activity", {
      method: "POST",
      body: JSON.stringify({ type: "story_start", refId: "story_1" }),
      retries: 0,
    });
  });

  it("swallows a failure with a warning rather than throwing at the caller", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    heartbeat.apiFetch.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "gone" },
    });

    expect(() => trackEvent("story_complete", "story_1")).not.toThrow();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("story_complete"),
      ),
    );
  });
});
