import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The corner has two faces. On `/select-profile` it names the grown-up, because
 * no child is playing yet and an adult is looking for the way in. Everywhere
 * else it is a bare lock — a photo of a child's own parent is the most tappable
 * thing that could be on a screen they are using, and FR-AUTH-04 wants that door
 * dull. Both faces open the same gate.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
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

const { ActiveChildProvider } = await import("@/lib/active-child");
const { ParentCorner } = await import("./ParentCorner");

const PARENT = {
  id: "parent_1",
  email: "salman@example.com",
  name: "Salman Rahman",
  avatarUrl: null,
};

function renderCorner() {
  render(
    <Providers locale="en">
      <ActiveChildProvider>
        <ParentCorner />
      </ActiveChildProvider>
    </Providers>,
  );
}

describe("ParentCorner", () => {
  beforeEach(() => {
    resetI18nForTests();
    for (const fn of Object.values(api)) fn.mockReset();
    router.push.mockReset();
    navigation.pathname = "/home";

    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: { parent: PARENT, activeChildProfileId: null },
    });
    api.listChildren.mockResolvedValue({ ok: true, data: [] });
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
    api.fetchGateStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true, isPinVerified: false, pinVerifiedUntil: null },
    });
  });

  it("names the grown-up on the profile-select screen", async () => {
    navigation.pathname = "/select-profile";
    renderCorner();

    await screen.findByText("Salman Rahman");
    // The accessible name stays the same on both faces: what the button does has
    // not changed, only how much it says out loud.
    expect(
      screen.getByRole("button", { name: "For grown-ups" }),
    ).toBeInTheDocument();
  });

  it("falls back to a generic label for an account Google gave no name", async () => {
    navigation.pathname = "/select-profile";
    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: { ...PARENT, name: null },
        activeChildProfileId: null,
      },
    });
    renderCorner();

    await screen.findByText("Grown-ups");
  });

  it("stays an unnamed lock on a screen a child is playing on", async () => {
    renderCorner();

    const button = await screen.findByRole("button", { name: "For grown-ups" });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("Salman Rahman")).not.toBeInTheDocument();
  });

  it("shows the lock rather than a half-built chip before the session loads", () => {
    navigation.pathname = "/select-profile";
    // `fetchAuthMe` never settles: the very first paint has no parent yet.
    api.fetchAuthMe.mockReturnValue(new Promise(() => {}));
    renderCorner();

    expect(
      screen.getByRole("button", { name: "For grown-ups" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Salman Rahman")).not.toBeInTheDocument();
  });

  it("still raises the PIN pad when the chip is tapped", async () => {
    navigation.pathname = "/select-profile";
    renderCorner();

    await screen.findByText("Salman Rahman");
    fireEvent.click(screen.getByRole("button", { name: "For grown-ups" }));

    await waitFor(() =>
      expect(screen.getByText("Grown-ups only")).toBeInTheDocument(),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("opens the parent area without a PIN pad when the gate is already passed", async () => {
    navigation.pathname = "/select-profile";
    api.fetchGateStatus.mockResolvedValue({
      ok: true,
      data: {
        hasPin: true,
        isPinVerified: true,
        pinVerifiedUntil: "2026-09-06T12:00:00.000Z",
      },
    });
    renderCorner();

    await screen.findByText("Salman Rahman");
    fireEvent.click(screen.getByRole("button", { name: "For grown-ups" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/parent/children"),
    );
  });
});
