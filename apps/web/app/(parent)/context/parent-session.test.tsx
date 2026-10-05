import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    // A signed-out visitor is routed to login; an error message here would read as a fault.
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

  it("reports an error when only the profile list fails, rather than going ready without it", async () => {
    api.listChildren.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });

    const seen = renderSession();

    // `ready` with no list would let every page through and skip the onboarding redirect.
    await waitFor(() => expect(seen.at(-1)?.status).toBe("error"));
    expect(seen.at(-1)?.error?.code).toBe("NETWORK_ERROR");
  });

  it("treats a 401 on the profile list as signed out", async () => {
    api.listChildren.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "no", status: 401 },
    });

    const seen = renderSession();

    await waitFor(() => expect(seen.at(-1)?.status).toBe("signedOut"));
  });

  it("keeps `refresh` stable across a load, so effects do not re-run on it", async () => {
    const seen = renderSession();

    const first = seen[0];
    if (first === undefined) throw new Error("provider never rendered");
    await waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));

    expect(seen.at(-1)?.refresh).toBe(first.refresh);
  });
});
