import type {
  ChildProfileResponse,
  WorldSummaryResponse,
  WorldTopicLessonsResponse,
} from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * NFR-SAFE-07 — nothing on the Student Portal leaves it.
 *
 * A child cannot evaluate a destination, cannot read a URL, and cannot get back
 * from wherever a tap sent them. So the rule is absolute rather than a matter of
 * which sites are acceptable: no anchor anywhere in the `(student)` tree points at
 * another origin.
 *
 * This sweeps the rendered DOM of every student screen rather than grepping the
 * source, because the dangerous link is the one built at runtime from content
 * data — a mascot URL, a lesson title, a palette value that turned out to be a
 * string somebody could smuggle markup through.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const audio = vi.hoisted(() => ({ play: vi.fn(async () => {}) }));
const api = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  listChildren: vi.fn(),
  listAvatars: vi.fn(),
  activateChild: vi.fn(),
  fetchGateStatus: vi.fn(),
  verifyPin: vi.fn(),
}));
const content = vi.hoisted(() => ({
  listWorlds: vi.fn(),
  listWorldLessons: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/parent-api", () => api);
vi.mock("@/lib/content-api", () => content);
vi.mock("@/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ActiveChildProvider } = await import("@/lib/active-child");
const { ParentCorner } = await import("@/components/student/ParentCorner");
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

/**
 * Content values are hostile on purpose: a CMS author could save any string in a
 * world name or a lesson title, and the sweep must fail if one of them ever
 * reaches the DOM as a link.
 */
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

/** Every anchor in the document that leaves this origin. */
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
        parent: { id: "parent_1", email: "p@example.com" },
        activeChildProfileId: CHILD.id,
      },
    });
    api.listChildren.mockResolvedValue({ ok: true, data: [CHILD] });
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
    api.fetchGateStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true, isPinVerified: false, pinVerifiedUntil: null },
    });
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
    renderStudent(<SelectProfileScreen />);

    await screen.findByRole("button", { name: "Play as Ayaan" });
    expect(externalHrefs()).toEqual([]);
  });

  it("holds on /home, including world names that contain a URL", async () => {
    renderStudent(<HomeScreen />);

    await screen.findByRole("button", {
      name: "Go to Jungle World https://example.com",
    });
    expect(externalHrefs()).toEqual([]);
  });

  it("holds on /world/[worldId], including lesson titles that contain a URL", async () => {
    renderStudent(<WorldScreen worldId="world_jungle" />);

    await screen.findByText(/The Letter A/);
    expect(externalHrefs()).toEqual([]);
  });
});
