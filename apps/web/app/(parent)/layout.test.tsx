import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { apiFetch } from "@/shared/api/api-client";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
}));

let pathname: string = PARENT_ROUTES.children;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

vi.mock("@/features/parent/parent-api", () => api);

const { default: ParentLayout } = await import("./layout");

const PARENT = {
  id: "parent_1",
  email: "parent@example.com",
  name: "Parent One",
  avatarUrl: null,
  consentGivenAt: "2026-06-01T00:00:00.000Z",
  hasCurrentConsent: true,
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

    // Rendering first would flash a profile list at someone signed out.
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
        parent: { ...PARENT, consentGivenAt: null, hasCurrentConsent: false },
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

  it("reports a failed profile list instead of rendering a page that waits on it forever", async () => {
    api.listChildren.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL", message: "boom", status: 500 },
    });

    renderLayout();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("dashboard")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("retries the load from the error state and then renders the page", async () => {
    api.listChildren.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "boom", status: 500 },
    });

    renderLayout();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByText("dashboard")).toBeInTheDocument(),
    );
  });

  it("signs the parent out when a later request comes back 401", async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText("dashboard")).toBeInTheDocument(),
    );

    // The cookie expired mid-visit: the next fetch answers 401 and the session re-reads itself.
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign in required", status: 401 },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    await apiFetch("/api/anything");

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(PARENT_ROUTES.login),
    );
    vi.unstubAllGlobals();
  });
});
