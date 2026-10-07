import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ChildProfileResponse,
  WorldSummaryResponse,
  WorldTopicLessonsResponse,
} from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { SITE_ROUTES } from "@/features/site/site-routes";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

// NFR-SAFE-07: nothing on the Student Portal leaves it.

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/home" }));
const audio = vi.hoisted(() => ({ play: vi.fn(async () => {}) }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
}));
const content = vi.hoisted(() => ({
  listWorlds: vi.fn(),
  listWorldLessons: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));
vi.mock("@/features/parent/parent-api", () => api);
vi.mock("@/features/content/content-api", () => content);
vi.mock("@/shared/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ActiveChildProvider } = await import(
  "@/features/children/active-child"
);
const { ParentCorner } = await import("@/features/student/ParentCorner");
const { SelectProfileScreen } = await import(
  "./select-profile/SelectProfileScreen"
);
const { HomeScreen } = await import("./home/HomeScreen");
const { WorldScreen } = await import("./world/[worldId]/WorldScreen");

const CHILD: ChildProfileResponse = {
  id: "child_1",
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: "char_lion",
  createdAt: "2026-07-01T00:00:00.000Z",
  stats: { stars: 3, coins: 8, badges: 1, currentStreak: 2 },
};

/** Hostile on purpose: a CMS author could save any string as a world name or lesson title. */
const WORLDS: WorldSummaryResponse[] = [
  {
    id: "world_jungle",
    slug: "jungle",
    name: "Jungle World https://example.com",
    palette: { primary: "#2E7D32", secondary: "#FDD835" },
    mascot: null,
  },
];

const TOPICS: WorldTopicLessonsResponse[] = [
  {
    id: "topic_1",
    slug: "letters",
    name: "Letters",
    sortOrder: 1,
    lessons: [
      {
        id: "lesson_1",
        slug: "letter-a",
        title: "The Letter A — see https://example.com",
        worldId: "world_jungle",
        sortOrder: 1,
        thumbnailUrl: null,
        durationEstimateSec: null,
        nameAudioUrl: null,
        progress: null,
      },
    ],
  },
];

function externalHrefs(): string[] {
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => {
      if (!/^(https?:)?\/\//i.test(href)) return false;
      return (
        new URL(href, window.location.origin).origin !== window.location.origin
      );
    });
}

/** The `(site)` pages carry external links, so reaching them from here would leave the portal by one hop. */
function siteHrefs(): string[] {
  const siteRoutes: readonly string[] = Object.values(SITE_ROUTES);
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => {
      if (href.startsWith("#")) return false;
      const { pathname } = new URL(href, window.location.origin);
      return siteRoutes.includes(pathname) || pathname.startsWith("/guide/");
    });
}

function renderStudent(screenNode: ReactNode) {
  return render(
    <Providers locale="en">
      <ActiveChildProvider>
        <ParentCorner />
        {screenNode}
      </ActiveChildProvider>
    </Providers>,
  );
}

describe("no external links anywhere in the Student Portal", () => {
  beforeEach(() => {
    resetI18nForTests();
    for (const fn of Object.values({ ...api, ...content })) fn.mockReset();

    api.fetchAuthMe.mockResolvedValue({
      ok: true,
      data: {
        parent: {
          id: "parent_1",
          email: "p@example.com",
          name: "Salman",
          avatarUrl: null,
        },
        activeChildProfileId: CHILD.id,
      },
    });
    api.listChildren.mockResolvedValue({ ok: true, data: [CHILD] });
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
    content.listWorlds.mockResolvedValue({
      ok: true,
      data: { worlds: WORLDS },
    });
    content.listWorldLessons.mockResolvedValue({
      ok: true,
      data: { topics: TOPICS },
    });
  });

  it("holds on /select-profile", async () => {
    // The parent corner here is a named chip with a photo from Google's CDN; the sweep must cover it.
    navigation.pathname = "/select-profile";
    renderStudent(<SelectProfileScreen />);

    await screen.findByRole("button", { name: "Play as Ayaan" });
    expect(externalHrefs()).toEqual([]);
    expect(siteHrefs()).toEqual([]);
  });

  it("holds on /home, including world names that contain a URL", async () => {
    navigation.pathname = "/home";
    renderStudent(<HomeScreen />);

    await screen.findByRole("button", {
      name: "Go to Jungle World https://example.com",
    });
    expect(externalHrefs()).toEqual([]);
    expect(siteHrefs()).toEqual([]);
  });

  it("holds on /world/[worldId], including lesson titles that contain a URL", async () => {
    navigation.pathname = "/world/world_jungle";
    renderStudent(<WorldScreen worldId="world_jungle" />);

    await screen.findByText(/The Letter A/);
    expect(externalHrefs()).toEqual([]);
    expect(siteHrefs()).toEqual([]);
  });
});

describe("no route into the public site from the Student Portal", () => {
  // The rendered sweep above covers three screens; this covers every source file the portal is built from,
  // redirects included — `router.replace` targets are invisible to a sweep of rendered links.
  const sourceDirs = [
    import.meta.dirname,
    join(import.meta.dirname, "../../features/student"),
  ];
  const sources = sourceDirs.flatMap((dir) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => ({
        file,
        text: readFileSync(join(dir, file), "utf8"),
      })),
  );

  it("finds the screens it is meant to sweep", () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.map(({ file }) => file)).toContain("ParentCorner.tsx");
  });

  it("imports no site route and names no guide path or bare root", () => {
    const offending = sources
      .filter(
        ({ text }) =>
          text.includes("features/site/") ||
          /["'`]\/guide\//.test(text) ||
          /(href=\{?|href:|push\(|replace\(|redirect\()\s*["'`]\/(\?[^"'`]*)?["'`]/.test(
            text,
          ),
      )
      .map(({ file }) => file);
    expect(offending).toEqual([]);
  });

  it("never sends a child to the homepage sign-in dialogs", () => {
    // Both open over the homepage; the portal's signed-out redirect uses `PARENT_ROUTES.signInPage`.
    const offending = sources
      .filter(({ text }) => /\b(PARENT|ADMIN)_ROUTES\.login\b/.test(text))
      .map(({ file }) => file);
    expect(offending).toEqual([]);
  });

  it("signs a child's device out to a page outside the public site", () => {
    const { pathname } = new URL(
      PARENT_ROUTES.signInPage,
      window.location.origin,
    );
    expect(Object.values(SITE_ROUTES)).not.toContain(pathname);
  });
});
