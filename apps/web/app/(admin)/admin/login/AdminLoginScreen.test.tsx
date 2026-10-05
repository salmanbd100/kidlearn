import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAdminMe: vi.fn(),
  fetchPlatformOverview: vi.fn(),
  adminSignIn: vi.fn(),
  adminSignOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => ADMIN_ROUTES.login,
}));

vi.mock("@/features/admin/admin-api", () => api);

const { AdminSessionProvider } = await import(
  "@/app/(admin)/context/admin-session"
);
const { AdminLoginScreen } = await import("./AdminLoginScreen");

const ADMIN = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Reviewer One",
  email: "reviewer@kidlearn.test",
};

function renderScreen() {
  return render(
    <AdminSessionProvider>
      <AdminLoginScreen />
    </AdminSessionProvider>,
  );
}

function signIn(): void {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "reviewer@kidlearn.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a-long-enough-admin-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  router.replace.mockReset();
  for (const mock of Object.values(api)) mock.mockReset();

  api.fetchAdminMe.mockResolvedValue({
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required",
      status: 401,
    },
  });
});

describe("AdminLoginScreen", () => {
  it("offers no signup or password-reset affordance", () => {
    renderScreen();

    // Sign-up is disabled server-side and passwords are reset by re-running the seed; a link would imply self-service.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/forgot/i)).not.toBeInTheDocument();
  });

  it("re-reads the session and lands on analytics after a successful sign-in", async () => {
    api.adminSignIn.mockResolvedValue({ ok: true });

    renderScreen();
    api.fetchAdminMe.mockResolvedValue({ ok: true, data: ADMIN });
    signIn();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.analytics),
    );
    expect(api.adminSignIn).toHaveBeenCalledWith(
      "reviewer@kidlearn.test",
      "a-long-enough-admin-password",
    );
    // Twice: once on mount, once after the sign-in.
    expect(api.fetchAdminMe).toHaveBeenCalledTimes(2);
  });

  it("shows one inline error for a rejected sign-in and stays put", async () => {
    api.adminSignIn.mockResolvedValue({ ok: false });

    renderScreen();
    signIn();

    // One message for wrong password and unknown email so a probe can't confirm which addresses are admins.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /did not match an administrator account/i,
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
