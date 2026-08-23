import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/**
 * The CMS shell: the guard's verdict, and that no page is rendered to someone it
 * has not cleared (file 31, spec §4.3).
 *
 * The API is stubbed at `lib/admin-api`, which is the module boundary the session
 * provider talks through. Stubbing `fetch` would test `apiFetch`'s envelope
 * handling a second time; that has its own suite.
 *
 * This is a convenience layer, not the security boundary — `requireAdmin` on the
 * server is that, and `apps/server/src/routes/admin/admin.test.ts` covers it. What
 * these assertions protect is the *other* failure: a parent seeing curriculum
 * content for a frame before being redirected.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAdminMe: vi.fn(),
  fetchPlatformOverview: vi.fn(),
  adminSignIn: vi.fn(),
  adminSignOut: vi.fn(),
}));

/** Widened past the literal so a test can point the guard at another route. */
let pathname: string = ADMIN_ROUTES.analytics;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

vi.mock("@/lib/admin-api", () => api);

const { default: AdminCmsLayout } = await import("./layout");

const ADMIN = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reviewer One",
  email: "reviewer@kidlearn.test",
};

function renderLayout() {
  return render(
    <AdminCmsLayout>
      <p>curriculum tree</p>
    </AdminCmsLayout>,
  );
}

beforeEach(() => {
  pathname = ADMIN_ROUTES.analytics;
  router.replace.mockReset();
  for (const mock of Object.values(api)) mock.mockReset();

  api.fetchAdminMe.mockResolvedValue({ ok: true, data: ADMIN });
});

describe("AdminCmsLayout", () => {
  it("renders the page and the six-section rail for a signed-in admin", async () => {
    renderLayout();

    expect(await screen.findByText("curriculum tree")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Admin sections" }),
    ).toBeInTheDocument();
    expect(screen.getByText(ADMIN.name)).toBeInTheDocument();
  });

  it("bounces a signed-in parent to the login screen without rendering the page", async () => {
    // What the API answers a valid parent session on `/api/admin/me`: authenticated,
    // but no `AdminUser` row claims the identity (spec §4.3).
    api.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
        status: 403,
      },
    });

    renderLayout();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.login),
    );
    expect(screen.queryByText("curriculum tree")).not.toBeInTheDocument();
  });

  it("bounces a visitor with no session at all", async () => {
    api.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      },
    });

    renderLayout();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.login),
    );
  });

  it("renders nothing but a status line while the session is still loading", () => {
    api.fetchAdminMe.mockReturnValue(new Promise(() => {}));

    renderLayout();

    // Rendering the CMS first would flash content at somebody who turns out not to
    // be an admin.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("curriculum tree")).not.toBeInTheDocument();
  });

  it("says the API is unreachable rather than pretending the admin is signed out", async () => {
    api.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the API." },
    });

    renderLayout();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // A dead server is not a signed-out admin, and redirecting would hide the cause.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the login screen with no rail and no redirect", async () => {
    pathname = ADMIN_ROUTES.login;
    api.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      },
    });

    renderLayout();

    expect(await screen.findByText("curriculum tree")).toBeInTheDocument();
    // A rail whose every link bounces back here would be worse than no rail.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
