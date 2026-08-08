import type { ChildProfileResponse } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/parent-api", () => api);

const { ActiveChildProvider } = await import("@/lib/active-child");
const { SelectProfileScreen } = await import("./SelectProfileScreen");

function child(
  overrides: Partial<ChildProfileResponse> = {},
): ChildProfileResponse {
  return {
    id: "child_1",
    firstName: "Ayaan",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: "char_lion",
    createdAt: "2026-07-01T00:00:00.000Z",
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
    ...overrides,
  };
}

const AVATARS = [
  {
    id: "char_lion",
    slug: "leo-the-lion",
    name: "Leo the Lion",
    imageUrl: null,
  },
];

function renderScreen() {
  return render(
    <Providers locale="en">
      <ActiveChildProvider>
        <SelectProfileScreen />
      </ActiveChildProvider>
    </Providers>,
  );
}

describe("SelectProfileScreen", () => {
  beforeEach(() => {
    resetI18nForTests();
    router.push.mockReset();
    router.replace.mockReset();
    for (const fn of Object.values(api)) fn.mockReset();

    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: { id: "parent_1", email: "p@example.com" },
        activeChildProfileId: null,
      },
    });
    api.listChildren.mockResolvedValue({
      ok: true,
      data: [child(), child({ id: "child_2", firstName: "Rubi" })],
    });
    api.listAvatars.mockResolvedValue({ ok: true, data: AVATARS });
  });

  it("asks who is learning and offers every profile", async () => {
    renderScreen();

    expect(
      await screen.findByRole("heading", { name: "Who's learning today?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play as Ayaan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play as Rubi" }),
    ).toBeInTheDocument();
  });

  it("activates the tapped profile and goes to the home screen", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: "child_2" },
    });
    renderScreen();

    fireEvent.click(
      await screen.findByRole("button", { name: "Play as Rubi" }),
    );

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/home"));
    expect(api.activateChild).toHaveBeenCalledWith("child_2");
  });

  it("asks for no PIN to switch profiles (FR-AUTH-06)", async () => {
    api.activateChild.mockResolvedValue({
      ok: true,
      data: { activeChildProfileId: "child_1" },
    });
    renderScreen();

    fireEvent.click(
      await screen.findByRole("button", { name: "Play as Ayaan" }),
    );

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/home"));
    // A sibling picking up the tablet must not meet a parental gate — the PIN
    // guards `/parent/*`, not who is playing.
    expect(screen.queryByRole("button", { name: /Digit/ })).toBeNull();
  });

  it("tells a child with no profile yet to fetch a grown-up", async () => {
    api.listChildren.mockResolvedValue({ ok: true, data: [] });
    renderScreen();

    expect(await screen.findByText("No players yet!")).toBeInTheDocument();
    expect(screen.getByText("Ask a grown-up to add you.")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "no session", status: 401 },
    });
    renderScreen();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/parent/login"),
    );
  });

  it("stays put and says so when activation fails", async () => {
    api.activateChild.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });
    renderScreen();

    fireEvent.click(
      await screen.findByRole("button", { name: "Play as Ayaan" }),
    );

    expect(
      await screen.findByText("Let's try that again."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
