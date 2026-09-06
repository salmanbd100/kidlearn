import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The layout is now more than a theme boundary: it also mounts the provider that
 * decides who is playing, and the one control that leaves the portal. This suite
 * covers what that boundary owns — the theme, and the parent corner being present
 * on every student screen by construction rather than by each page remembering it.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
/** Any student screen but `/select-profile`, where the corner is a named chip. */
const navigation = vi.hoisted(() => ({ pathname: "/home" }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
  fetchGateStatus: vi.fn(),
  verifyPin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));
vi.mock("@/lib/parent-api", () => api);

const { default: StudentLayout } = await import("./layout");

function renderLayout() {
  return render(
    <Providers locale="en">
      <StudentLayout>
        <p>lesson</p>
      </StudentLayout>
    </Providers>,
  );
}

describe("StudentLayout", () => {
  beforeEach(() => {
    resetI18nForTests();
    for (const fn of Object.values(api)) fn.mockReset();

    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: {
          id: "parent_1",
          email: "p@example.com",
          name: "Salman",
          avatarUrl: null,
        },
        activeChildProfileId: null,
      },
    });
    api.listChildren.mockResolvedValue({ ok: true, data: [] });
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
  });

  it("selects the kid theme for everything it wraps", () => {
    renderLayout();

    expect(screen.getByText("lesson").closest("[data-theme]")).toHaveAttribute(
      "data-theme",
      "kid",
    );
  });

  it("puts the way out on every student screen", async () => {
    renderLayout();

    // Present by construction: a page cannot forget it, and a child cannot be
    // stranded on a screen with no exit (Pillar C).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "For grown-ups" }),
      ).toBeInTheDocument(),
    );
  });
});
