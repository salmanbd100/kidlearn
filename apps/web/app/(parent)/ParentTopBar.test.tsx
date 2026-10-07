import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
}));
const client = vi.hoisted(() => ({
  signOut: vi.fn(async () => true),
  onUnauthorized: vi.fn(() => () => {}),
}));

let pathname: string = PARENT_ROUTES.dashboard;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));
vi.mock("@/features/parent/parent-api", () => api);
vi.mock("@/shared/api/api-client", () => client);

const { ParentSessionProvider } = await import(
  "@/app/(parent)/context/parent-session"
);
const { ParentTopBar } = await import("./ParentTopBar");

const PARENT = {
  id: "parent_1",
  email: "salman@example.com",
  name: "Salman Rahman",
  avatarUrl: null,
  consentGivenAt: "2026-06-01T00:00:00.000Z",
  hasCurrentConsent: true,
};

const CHILD = {
  id: "child_1",
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
};

function renderBar() {
  render(
    <Providers locale="en">
      <ParentSessionProvider>
        <ParentTopBar />
      </ParentSessionProvider>
    </Providers>,
  );
}

/** Radix opens on keyboard as well as pointer, and jsdom has no pointer. */
async function openMenu() {
  const trigger = await screen.findByRole("button", { name: "Your account" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

beforeEach(() => {
  resetI18nForTests();
  pathname = PARENT_ROUTES.dashboard;
  router.replace.mockReset();
  client.signOut.mockReset();
  client.signOut.mockResolvedValue(true);
  for (const mock of Object.values(api)) mock.mockReset();

  api.fetchAuthMe.mockResolvedValue({
    ok: true,
    data: { parent: PARENT, activeChildProfileId: null },
  });
  api.listChildren.mockResolvedValue({ ok: true, data: [CHILD] });
});

describe("ParentTopBar", () => {
  it("marks only the section being viewed as current", async () => {
    pathname = PARENT_ROUTES.children;
    renderBar();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Children" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(screen.getByRole("link", { name: "Progress" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("link", { name: "Weekly report" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("links the wordmark to the public homepage", async () => {
    renderBar();

    expect(
      await screen.findByRole("link", { name: "KidLearn" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders nothing while the session is still loading", () => {
    renderBar();

    // A bar that appears half-populated then reshuffles is worse than one that arrives once.
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("stays out of the way on the onboarding steps", async () => {
    pathname = PARENT_ROUTES.consent;
    renderBar();

    // A sign-out control mid-consent is a dead end, not an escape.
    await waitFor(() => expect(api.fetchAuthMe).toHaveBeenCalled());
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("names the signed-in parent in the account menu", async () => {
    renderBar();
    await openMenu();

    await screen.findByText("Salman Rahman");
    expect(screen.getByText("salman@example.com")).toBeInTheDocument();
  });

  it("falls back to a generic label for an account Google gave no name", async () => {
    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: { parent: { ...PARENT, name: null }, activeChildProfileId: null },
    });
    renderBar();
    await openMenu();

    // Two of them: the trigger's own accessible name, and the menu heading.
    await waitFor(() =>
      expect(screen.getAllByText("Your account").length).toBeGreaterThan(0),
    );
  });

  it("offers the way back to the student portal on the bar, not in the menu", async () => {
    renderBar();

    // On the bar itself: inside the account menu it was two taps deep and unfindable.
    const link = await screen.findByRole("link", { name: "Back to kid mode" });
    expect(link).toHaveAttribute("href", "/select-profile");
  });

  it("revokes the session and lands on the homepage when signing out", async () => {
    renderBar();
    await openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(client.signOut).toHaveBeenCalled());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });

  it("stays put and says so when the server refuses the sign-out", async () => {
    // A 500 leaves the cookie live; navigating anyway would bounce back to the dashboard and
    // leave the parent believing they had signed out on a shared device.
    client.signOut.mockResolvedValue(false);
    renderBar();
    await openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We could not sign you out. Please try again.",
      ),
    );
    expect(router.replace).not.toHaveBeenCalled();
    // The session is untouched, so nothing should have re-read it either.
    expect(api.fetchAuthMe).toHaveBeenCalledTimes(1);
  });

  it("clears the failure notice when a retry succeeds", async () => {
    client.signOut.mockResolvedValue(false);
    renderBar();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    client.signOut.mockResolvedValue(true);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes home without clearing the session first, so the guard cannot open sign-in instead", async () => {
    renderBar();
    await openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    // Re-reading `/api/auth/me` here would empty the session while `ParentGuard` is still mounted,
    // and its redirect to the sign-in dialog would race this one.
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(router.replace).not.toHaveBeenCalledWith(PARENT_ROUTES.login);
    expect(api.fetchAuthMe).toHaveBeenCalledTimes(1);
  });
});
