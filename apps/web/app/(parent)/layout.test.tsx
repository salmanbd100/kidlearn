import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/**
 * The layout is now more than a theme boundary: it wraps everything in the session
 * provider and the guard, so this suite covers the two things that changed with it —
 * that the theme still applies, and that a page is not rendered to someone the guard
 * has not cleared.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
}));

/** Widened past the literal so a test can point the guard at another route. */
let pathname: string = PARENT_ROUTES.children;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

vi.mock("@/lib/parent-api", () => api);

const { default: ParentLayout } = await import("./layout");

const PARENT = {
  id: "parent_1",
  email: "parent@example.com",
  name: "Parent One",
  avatarUrl: null,
  consentGivenAt: "2026-06-01T00:00:00.000Z",
};

const CHILD = {
  id: "child_1",
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: "char_lion",
  createdAt: "2026-07-01T00:00:00.000Z",
  stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
};

function renderLayout() {
  return render(
    <Providers locale="en">
      <ParentLayout>
        <p>dashboard</p>
      </ParentLayout>
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
  pathname = PARENT_ROUTES.children;
  router.replace.mockReset();
  router.push.mockReset();
  for (const mock of Object.values(api)) mock.mockReset();

  api.fetchAuthMe.mockResolvedValue({
    ok: true,
    data: { parent: PARENT, activeChildProfileId: null },
  });
  api.listChildren.mockResolvedValue({ ok: true, data: [CHILD] });
});

describe("ParentLayout", () => {
  it("selects the parent theme for everything it wraps", async () => {
    renderLayout();

    await waitFor(() =>
      expect(screen.getByText("dashboard")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("dashboard").closest("[data-theme]"),
    ).toHaveAttribute("data-theme", "parent");
  });

  it("renders the page for an onboarded parent inside a live grant", async () => {
    renderLayout();

    await waitFor(() =>
      expect(screen.getByText("dashboard")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows a loading status rather than the page while the session loads", () => {
    renderLayout();

    // Rendering first would flash a profile list at someone who turns out to be
    // signed out.
    expect(screen.getByRole("status")).toHaveTextContent("Loading profiles…");
    expect(screen.queryByText("dashboard")).toBeNull();
  });

  it("sends a signed-out visitor to login and renders nothing on the way", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign in required", status: 401 },
    });

    renderLayout();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(PARENT_ROUTES.login),
    );
    expect(screen.queryByText("dashboard")).toBeNull();
  });

  it("sends a parent with no consent record to the consent screen", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: { ...PARENT, consentGivenAt: null },
        activeChildProfileId: null,
      },
    });

    renderLayout();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(PARENT_ROUTES.consent),
    );
  });

  it("does not gate the login screen", async () => {
    pathname = PARENT_ROUTES.login;
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign in required", status: 401 },
    });

    renderLayout();

    await waitFor(() =>
      expect(screen.getByText("dashboard")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reports a network failure instead of pretending to be signed out", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the API" },
    });

    renderLayout();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We can't reach KidLearn right now. Please check your connection.",
      ),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
