import { describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => navigation);

const { default: AdminLoginPage } = await import("./page");

describe("/admin/login", () => {
  it("sends old links and bookmarks to the homepage sign-in dialog", () => {
    AdminLoginPage();

    expect(navigation.redirect).toHaveBeenCalledWith(ADMIN_ROUTES.login);
  });
});
