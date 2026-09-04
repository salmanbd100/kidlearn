import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
  GradeLevelValue,
} from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ChildCard } from "./ChildCard";

// The grade label is the point of this suite.

const AVATARS: AvatarCharacterResponse[] = [
  {
    id: "char_lion",
    slug: "leo-the-lion",
    name: "Leo the Lion",
    imageUrl: null,
  },
];

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

function renderCard(profile: ChildProfileResponse, locale: "en" | "bn" = "en") {
  render(
    <Providers locale={locale}>
      <ul>
        <ChildCard
          child={profile}
          avatars={AVATARS}
          editHref="/parent/children/child_1/edit"
          screenTimeHref="/parent/children/child_1/screen-time"
          onDeleteRequest={vi.fn()}
        />
      </ul>
    </Providers>,
  );
}

describe("ChildCard", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it.each<[GradeLevelValue, string]>([
    ["NURSERY", "Nursery"],
    ["KG1", "KG-1"],
    ["KG2", "KG-2"],
  ])("names the %s grade as %s", (gradeLevel, label) => {
    renderCard(child({ gradeLevel }));

    expect(screen.getByText(`Age 4 · ${label} · English`)).toBeInTheDocument();
  });

  it("names the grade in Bangla too", () => {
    renderCard(child({ gradeLevel: "KG2", preferredLanguage: "bn" }), "bn");

    expect(screen.getByText("বয়স 4 · কেজি-২ · বাংলা")).toBeInTheDocument();
  });

  it("labels its actions with the child's name, so two cards are distinguishable", () => {
    renderCard(child({ firstName: "Nadia" }));

    expect(
      screen.getByRole("link", { name: "Edit Nadia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Nadia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Screen time for Nadia" }),
    ).toBeInTheDocument();
  });

  it("links to this child's screen-time settings (FR-TIME-05)", () => {
    renderCard(child());

    expect(
      screen.getByRole("link", { name: "Screen time for Ayaan" }),
    ).toHaveAttribute("href", "/parent/children/child_1/screen-time");
  });
});
