import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { apiFetch } from "@/shared/api/api-client";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAdminMe: vi.fn(),
  fetchPlatformOverview: vi.fn(),
  adminSignIn: vi.fn(),
  adminSignOut: vi.fn(),
  // The shell polls this for the AI Queue badge.
  fetchAiJobCount: vi.fn(),
}));

let pathname: string = ADMIN_ROUTES.analytics;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

vi.mock("@/features/admin/admin-api", () => api);
vi.mock("@/features/admin/ai-api", () => api);

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
  api.fetchAiJobCount.mockResolvedValue({
    ok: true,
    data: { awaitingReview: 0 },
  });
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
    // A valid parent session on `/api/admin/me`: authenticated, but no `AdminUser` row claims the identity.
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

  it("does not poll the review count on the login screen", async () => {
    // An unauthenticated poll is a 401 a minute, and there is no rail for the badge.
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
    await screen.findByText("curriculum tree");

    expect(api.fetchAiJobCount).not.toHaveBeenCalled();
  });

  it("badges the AI Queue with what the shell polled", async () => {
    api.fetchAiJobCount.mockResolvedValue({
      ok: true,
      data: { awaitingReview: 4 },
    });

    renderLayout();

    expect(
      await screen.findByText("4 jobs awaiting review"),
    ).toBeInTheDocument();
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

  it("signs the admin out when a later request comes back 401 (R-12)", async () => {
    renderLayout();
    await screen.findByText("curriculum tree");

    // The session expired mid-visit: the next CMS request answers 401, and the
    // session re-reads itself rather than leaving the editor on a generic error.
    api.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      },
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

    await apiFetch("/api/admin/stories");

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.login),
    );
    vi.unstubAllGlobals();
  });
  it("signs the admin out and goes to login when the cookie is revoked", async () => {
    api.adminSignOut.mockResolvedValue(true);
    renderLayout();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.login),
    );
  });

  it("keeps the session and says so when sign-out fails", async () => {
    // The cookie is still live, so going to login would bounce straight back into the CMS.
    api.adminSignOut.mockResolvedValue(false);
    renderLayout();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not sign out/i,
    );
    expect(screen.getByText("curriculum tree")).toBeInTheDocument();
    expect(screen.getByText(ADMIN.name)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
