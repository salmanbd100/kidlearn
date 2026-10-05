import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/home" }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));
vi.mock("@/features/parent/parent-api", () => api);

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

    // Present by construction: a child cannot be stranded on a screen with no exit (Pillar C).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "For grown-ups" }),
      ).toBeInTheDocument(),
    );
  });
});
