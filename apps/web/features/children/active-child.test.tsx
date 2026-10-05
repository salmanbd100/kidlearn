import type { ChildProfileResponse } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { LOCALE_COOKIE_NAME } from "@/shared/lib/locale";

const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
}));

vi.mock("@/features/parent/parent-api", () => api);

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

function PortalExit() {
  const [inPortal, setInPortal] = useState(true);
  const { i18n } = useTranslation();

  if (!inPortal) return <p>device language: {i18n.resolvedLanguage}</p>;
  return (
    <>
      <button type="button" onClick={() => setInPortal(false)}>
        leave
      </button>
      <ActiveChildProvider>
        <Probe />
      </ActiveChildProvider>
    </>
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
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom implements document.cookie, not the Cookie Store API.
    document.cookie = `${LOCALE_COOKIE_NAME}=en; path=/`;
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

  it("leaves the device's language cookie alone (R-11)", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: RUBI.id },
    });
    renderProvider();

    await screen.findByText("language: en");
    fireEvent.click(screen.getByRole("button", { name: "pick Rubi" }));
    await screen.findByText("language: bn");

    // The cookie is the parent's choice: it decides the dashboard, the login
    // page and `<html lang>` on the next load.
    expect(document.cookie).not.toContain(`${LOCALE_COOKIE_NAME}=bn`);
  });

  it("hands the interface back to the device's language on leaving the portal", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: RUBI.id },
    });
    // The root layout's `Providers` survives a client navigation; only the
    // student layout, and the provider in it, unmounts.
    render(
      <Providers locale="en">
        <PortalExit />
      </Providers>,
    );

    await screen.findByText("language: en");
    fireEvent.click(screen.getByRole("button", { name: "pick Rubi" }));
    await screen.findByText("language: bn");

    fireEvent.click(screen.getByRole("button", { name: "leave" }));

    await screen.findByText("device language: en");
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
