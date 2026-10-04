import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const state = vi.hoisted(() => ({ pathname: "/admin", status: "ready" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => state.pathname,
}));
vi.mock("./context/admin-session", () => ({
  useAdminSession: () => ({ status: state.status }),
}));

const { AdminGuard } = await import("./AdminGuard");

function renderGuard(pathname: string, status: string) {
  state.pathname = pathname;
  state.status = status;
  return render(
    <AdminGuard>
      <p>cms page</p>
    </AdminGuard>,
  );
}

describe("AdminGuard", () => {
  beforeEach(() => {
    router.replace.mockReset();
  });

  it("shows the CMS to a signed-in admin", () => {
    renderGuard("/admin/curriculum", "ready");

    expect(screen.getByText("cms page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows nothing of the CMS while the session loads", () => {
    renderGuard("/admin/curriculum", "loading");

    expect(screen.queryByText("cms page")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects a signed-out visitor to the login screen without a flash of the CMS", () => {
    renderGuard("/admin/curriculum", "signedOut");

    expect(router.replace).toHaveBeenCalledWith("/admin/login");
    expect(screen.queryByText("cms page")).not.toBeInTheDocument();
  });

  it("lets a signed-out visitor see the login screen itself", () => {
    renderGuard("/admin/login", "signedOut");

    expect(screen.getByText("cms page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("never renders the CMS when the session could not be read", () => {
    renderGuard("/admin/curriculum", "error");

    expect(screen.queryByText("cms page")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not treat a lookalike path as the public login screen", () => {
    renderGuard("/admin/login-help/../curriculum", "signedOut");

    expect(screen.queryByText("cms page")).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalled();
  });
});
