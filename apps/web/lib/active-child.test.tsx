import type { ChildProfileResponse } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The provider every student screen reads from.
 *
 * The API is stubbed at `lib/parent-api`, which is the module boundary the
 * provider talks through — stubbing `fetch` instead would re-test `apiFetch`'s
 * envelope handling, which has its own suite.
 */

const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
}));

vi.mock("@/lib/parent-api", () => api);

const { ActiveChildProvider, useActiveChild } = await import("./active-child");

function child(
  overrides: Partial<ChildProfileResponse> = {},
): ChildProfileResponse {
  return {
    id: "child_1",
    firstName: "Ayaan",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: "char_lion",
    createdAt: "2026-07-01T00:00:00.000Z",
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
    ...overrides,
  };
}

const RUBI = child({
  id: "child_2",
  firstName: "Rubi",
  preferredLanguage: "bn",
});

/** Surfaces the pieces of the context each assertion below is about. */
function Probe() {
  const { status, child: active, profiles, activate } = useActiveChild();
  const { i18n } = useTranslation();

  return (
    <div>
      <p>status: {status}</p>
      <p>active: {active?.firstName ?? "none"}</p>
      <p>language: {i18n.resolvedLanguage}</p>
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          onClick={() => {
            void activate(profile.id);
          }}
        >
          pick {profile.firstName}
        </button>
      ))}
    </div>
  );
}

function renderProvider() {
  return render(
    <Providers locale="en">
      <ActiveChildProvider>
        <Probe />
      </ActiveChildProvider>
    </Providers>,
  );
}

describe("ActiveChildProvider", () => {
  beforeEach(() => {
    resetI18nForTests();
    for (const fn of Object.values(api)) fn.mockReset();

    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: { id: "parent_1", email: "p@example.com" },
        activeChildProfileId: null,
      },
    });
    api.listChildren.mockResolvedValue({ ok: true, data: [child(), RUBI] });
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
  });

  it("has no active child until one is picked", async () => {
    renderProvider();

    await screen.findByText("status: ready");
    expect(screen.getByText("active: none")).toBeInTheDocument();
  });

  it("scopes the session to the child that was picked", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: "child_1" },
    });
    renderProvider();

    fireEvent.click(await screen.findByRole("button", { name: "pick Ayaan" }));

    await screen.findByText("active: Ayaan");
    expect(api.activateChild).toHaveBeenCalledWith("child_1");
  });

  it("switches the interface to the picked child's language (FR-I18N-02)", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: RUBI.id },
    });
    renderProvider();

    await screen.findByText("language: en");
    fireEvent.click(screen.getByRole("button", { name: "pick Rubi" }));

    await screen.findByText("language: bn");
  });

  it("restores the child the session already remembers, without a second pick", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: { id: "parent_1", email: "p@example.com" },
        activeChildProfileId: RUBI.id,
      },
    });
    renderProvider();

    // A reload has to land in Bangla too — the preference belongs to the child,
    // not to the tap that selected them.
    await screen.findByText("active: Rubi");
    await screen.findByText("language: bn");
    expect(api.activateChild).not.toHaveBeenCalled();
  });

  it("keeps the previous child when activation fails", async () => {
    api.activateChild.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "gone", status: 404 },
    });
    renderProvider();

    fireEvent.click(await screen.findByRole("button", { name: "pick Ayaan" }));

    await waitFor(() => expect(api.activateChild).toHaveBeenCalled());
    expect(screen.getByText("active: none")).toBeInTheDocument();
  });

  it("reports a signed-out visitor rather than an error", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "no session", status: 401 },
    });
    renderProvider();

    await screen.findByText("status: signedOut");
  });

  it("reports an error when the profile list cannot be read", async () => {
    api.listChildren.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });
    renderProvider();

    await screen.findByText("status: error");
  });
});
