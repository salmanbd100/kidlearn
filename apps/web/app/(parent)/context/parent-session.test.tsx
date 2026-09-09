import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the provider reports for each shape of `GET /api/auth/me`. The branch
 * that matters is the 401: it is the ordinary signed-out case and must not be
 * reported as an error, or a signed-out visitor meets a failure message instead
 * of the login screen.
 */
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
}));

vi.mock("@/features/parent/parent-api", () => api);

const { ParentSessionProvider, useParentSession } = await import(
  "./parent-session"
);

const PARENT = {
  id: "parent_1",
  email: "parent@example.com",
  name: "Parent One",
  avatarUrl: null,
  consentGivenAt: "2026-06-01T00:00:00.000Z",
};

type Session = ReturnType<typeof useParentSession>;

/** Every render's session value, so identities can be compared across loads. */
function renderSession(): Session[] {
  const seen: Session[] = [];

  function Probe() {
    seen.push(useParentSession());
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
  api.fetchAuthMe.mockResolvedValue({
    ok: true,
    data: { parent: PARENT, activeChildProfileId: null },
  });
  api.listChildren.mockResolvedValue({ ok: true, data: [] });
});

describe("ParentSessionProvider", () => {
  it("reports the parent once both requests land", async () => {
    const seen = renderSession();

    await waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));
    expect(seen.at(-1)?.parent).toEqual(PARENT);
    expect(seen.at(-1)?.children).toEqual([]);
    expect(seen.at(-1)?.error).toBeUndefined();
  });

  it("treats a 401 as signed out rather than as an error", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "no session" },
    });

    const seen = renderSession();

    await waitFor(() => expect(seen.at(-1)?.status).toBe("signedOut"));
    expect(seen.at(-1)?.parent).toBeUndefined();
    // A signed-out visitor is routed to login; an error message here would be
    // reported as a fault instead.
    expect(seen.at(-1)?.error).toBeUndefined();
  });

  it("reports any other failure as an error", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });

    const seen = renderSession();

    await waitFor(() => expect(seen.at(-1)?.status).toBe("error"));
    expect(seen.at(-1)?.error?.code).toBe("NETWORK_ERROR");
  });

  it("leaves the profiles undefined when only that request fails", async () => {
    api.listChildren.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });

    const seen = renderSession();

    // The parent is still known, so the shell renders; only the list is missing.
    await waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));
    expect(seen.at(-1)?.parent).toEqual(PARENT);
    expect(seen.at(-1)?.children).toBeUndefined();
  });

  it("keeps `refresh` stable across a load, so effects do not re-run on it", async () => {
    const seen = renderSession();

    const first = seen[0];
    if (first === undefined) throw new Error("provider never rendered");
    await waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));

    expect(seen.at(-1)?.refresh).toBe(first.refresh);
  });
});
