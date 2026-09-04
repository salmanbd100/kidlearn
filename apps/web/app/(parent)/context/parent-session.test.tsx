import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate's *identities*, not its behaviour — which `PinGate.test.tsx` covers.
 */
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  fetchGateStatus: vi.fn(),
  verifyPin: vi.fn(),
}));

vi.mock("@/lib/parent-api", () => api);

const { ParentSessionProvider, useParentGate } = await import(
  "./parent-session"
);

const PARENT = {
  id: "parent_1",
  email: "parent@example.com",
  hasPin: true,
  consentGivenAt: "2026-06-01T00:00:00.000Z",
};

type Gate = ReturnType<typeof useParentGate>;

/** Every render's gate value, so identities can be compared across a flip. */
function renderGate(): Gate[] {
  const seen: Gate[] = [];

  function Probe() {
    seen.push(useParentGate());
    return null;
  }

  render(
    <ParentSessionProvider>
      <Probe />
    </ParentSessionProvider>,
  );

  return seen;
}

beforeEach(() => {
  api.fetchAuthMe.mockResolvedValue({ ok: true, data: { parent: PARENT } });
  api.listChildren.mockResolvedValue({ ok: true, data: [] });
  api.fetchGateStatus.mockResolvedValue({
    ok: true,
    data: {
      hasPin: true,
      isPinVerified: true,
      pinVerifiedUntil: "2099-01-01T00:00:00.000Z",
    },
  });
});

describe("ParentSessionProvider — gate action identity", () => {
  it("keeps `guard` stable when the gate locks", async () => {
    const seen = renderGate();
    await waitFor(() => expect(seen.at(-1)?.isLocked).toBe(false));

    const before = seen.at(-1);
    if (before === undefined) throw new Error("gate never rendered");

    await act(async () => {
      before.relock();
    });

    const after = seen.at(-1);
    // The flip happened...
    expect(after?.isLocked).toBe(true);
    // ...and did not hand any consumer a new callback to re-run an effect on.
    expect(after?.guard).toBe(before.guard);
    expect(after?.relock).toBe(before.relock);
    expect(after?.unlock).toBe(before.unlock);
  });

  it("keeps `guard` stable when the gate unlocks again", async () => {
    const seen = renderGate();
    await waitFor(() => expect(seen.at(-1)?.isLocked).toBe(false));

    const first = seen.at(-1);
    if (first === undefined) throw new Error("gate never rendered");

    await act(async () => {
      first.relock();
    });
    await act(async () => {
      first.unlock("2099-01-01T00:00:00.000Z");
    });

    expect(seen.at(-1)?.isLocked).toBe(false);
    expect(seen.at(-1)?.guard).toBe(first.guard);
  });
});
