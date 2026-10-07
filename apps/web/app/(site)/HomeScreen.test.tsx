import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import type { Locale } from "@/shared/lib/locale";
import { scrollEverythingIntoView } from "@/shared/testing/intersection-observer";

const navigation = vi.hoisted(() => ({ search: "" }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const session = vi.hoisted(() => ({
  role: "signedOut" as "unknown" | "signedOut" | "parent" | "admin",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/features/site/use-signed-in-role", () => ({
  useSignedInRole: () => session.role,
}));

const { HomeScreen } = await import("./HomeScreen");

function renderHome(locale: Locale = "en") {
  return render(
    <Providers locale={locale}>
      <HomeScreen />
    </Providers>,
  );
}

describe("HomeScreen", () => {
  beforeEach(() => {
    resetI18nForTests();
    navigation.search = "";
    session.role = "signedOut";
    router.replace.mockReset();
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("renders the wordmark and every section heading in English", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "KidLearn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Read the guides" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What makes it different" }),
    ).toBeInTheDocument();
  });

  it("renders its title in Bangla", () => {
    renderHome("bn");

    expect(
      screen.getByRole("heading", { level: 1, name: "কিডলার্ন" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "শেখা শুরু করো" }),
    ).toBeInTheDocument();
  });

  it("sends a child to the profile picker, a parent to sign-in and an admin to the CMS login", () => {
    renderHome();

    expect(
      screen.getByRole("link", { name: "Start learning" }),
    ).toHaveAttribute("href", "/select-profile");
    expect(
      screen.getByRole("link", { name: "Parent sign-in" }),
    ).toHaveAttribute("href", "/?signin=parent");
    expect(screen.getByRole("link", { name: "Admin sign-in" })).toHaveAttribute(
      "href",
      "/?signin=admin",
    );
  });

  it("offers a signed-in parent their dashboard instead of sign-in, and hides the admin link", () => {
    session.role = "parent";
    renderHome();

    expect(
      screen.getByRole("link", { name: "Parent dashboard" }),
    ).toHaveAttribute("href", "/parent");
    expect(screen.queryByRole("link", { name: "Parent sign-in" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull();
  });

  it("offers a signed-in admin the CMS instead of the admin sign-in", () => {
    session.role = "admin";
    renderHome();

    expect(
      screen.getByRole("link", { name: "Admin dashboard" }),
    ).toHaveAttribute("href", "/admin/analytics");
    expect(screen.queryByRole("link", { name: "Admin sign-in" })).toBeNull();
  });

  it("keeps the sign-in actions while the session is still unknown", () => {
    session.role = "unknown";
    renderHome();

    expect(
      screen.getByRole("link", { name: "Parent sign-in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Admin sign-in" }),
    ).toBeInTheDocument();
  });

  it("puts Start learning first, so it is the first action a child reaches", () => {
    renderHome();

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("Start learning");
  });

  it("keeps the sign-in dialog closed until it is asked for", () => {
    renderHome();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the parent sign-in dialog over the homepage from ?signin=parent", async () => {
    navigation.search = "signin=parent";
    renderHome();

    const dialog = await screen.findByRole("dialog", {
      name: "Parent sign-in",
    });
    expect(dialog.closest("[data-theme]")).toHaveAttribute(
      "data-theme",
      "parent",
    );
    expect(
      screen.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute("href", "http://localhost:4000/api/auth/google");
  });

  it("drops the query when the dialog is closed, leaving the homepage", async () => {
    navigation.search = "signin=parent";
    renderHome();

    fireEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("opens the CMS sign-in dialog from ?signin=admin, and only that one", async () => {
    navigation.search = "signin=admin";
    renderHome();

    expect(
      await screen.findByRole("dialog", { name: "kidlearn CMS" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("links each guide entry to its page", () => {
    renderHome();

    expect(screen.getByRole("link", { name: "For parents" })).toHaveAttribute(
      "href",
      "/guide/parents",
    );
    expect(
      screen.getByRole("link", { name: "For content admins" }),
    ).toHaveAttribute("href", "/guide/admins");
    expect(screen.getByRole("link", { name: "For engineers" })).toHaveAttribute(
      "href",
      "/guide/engineering",
    );
  });

  it("explains how it works in three steps, in order", () => {
    renderHome();

    const section = screen.getByRole("region", { name: "How it works" });
    const steps = within(section).getAllByRole("heading", { level: 3 });
    expect(steps.map((step) => step.textContent)).toEqual([
      "Pick your picture",
      "Play a lesson",
      "Earn stars",
    ]);
  });

  it("hides the hero picture from assistive technology", () => {
    renderHome();

    expect(screen.getByTestId("hero-scene")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("holds the hero blocks above the scene until it scrolls into view", () => {
    renderHome();

    const block = screen.getByTestId("hero-scene").querySelector("g");
    // Motion writes an SVG element's starting values as attributes, not inline style.
    expect(block).toHaveAttribute("opacity", "0");
  });

  it("renders the hero blocks settled under reduced motion (NFR-A11Y-05)", () => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
    renderHome();

    const block = screen.getByTestId("hero-scene").querySelector("g");
    expect(block).not.toHaveAttribute("opacity", "0");
  });

  it("starts the headline below its resting place when motion is allowed", () => {
    renderHome();

    expect(screen.getByTestId("home-headline").style.opacity).toBe("0");
  });

  it("renders the headline settled under reduced motion (NFR-A11Y-05)", () => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
    renderHome();

    const headline = screen.getByTestId("home-headline");
    expect(headline.style.opacity).not.toBe("0");
    expect(headline.style.transform).not.toContain("16px");
  });

  it("brings the guide entries into sight once they scroll into view", async () => {
    renderHome();
    const entry = screen.getByRole("link", { name: "For parents" })
      .parentElement as HTMLElement;
    expect(entry.style.opacity).toBe("0");

    act(() => scrollEverythingIntoView());

    await waitFor(() => expect(entry.style.opacity).toBe("1"), {
      timeout: 2000,
    });
  });
});
