import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "./admin-routes";

const navigation = vi.hoisted(() => ({ search: "signin=admin" }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({ adminSignIn: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("./admin-api", () => api);

const { AdminSignInDialog } = await import("./AdminSignInDialog");

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
  navigation.search = "signin=admin";
  router.replace.mockReset();
  api.adminSignIn.mockReset();
});

describe("AdminSignInDialog", () => {
  it("stays closed without ?signin=admin, including for the parent dialog's value", () => {
    navigation.search = "signin=parent";
    render(<AdminSignInDialog />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a parent-themed dialog named for the CMS", async () => {
    render(<AdminSignInDialog />);

    const dialog = await screen.findByRole("dialog", { name: "kidlearn CMS" });
    expect(dialog.closest("[data-theme]")).toHaveAttribute(
      "data-theme",
      "parent",
    );
  });

  it("offers no signup or password-reset affordance", async () => {
    render(<AdminSignInDialog />);
    await screen.findByRole("dialog");

    // Sign-up is disabled server-side and passwords are reset by re-running the seed; a link would imply self-service.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/forgot/i)).not.toBeInTheDocument();
  });

  it("lands on analytics after a successful sign-in", async () => {
    api.adminSignIn.mockResolvedValue({ ok: true });
    render(<AdminSignInDialog />);
    await screen.findByRole("dialog");

    signIn();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(ADMIN_ROUTES.analytics),
    );
    expect(api.adminSignIn).toHaveBeenCalledWith(
      "reviewer@kidlearn.test",
      "a-long-enough-admin-password",
    );
  });

  it("shows one inline error for a rejected sign-in and stays put", async () => {
    api.adminSignIn.mockResolvedValue({ ok: false });
    render(<AdminSignInDialog />);
    await screen.findByRole("dialog");

    signIn();

    // One message for wrong password and unknown email so a probe can't confirm which addresses are admins.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /did not match an administrator account/i,
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("drops the query when closed, leaving the homepage", async () => {
    render(<AdminSignInDialog />);

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
  });
});
