import type { StorySummaryResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { StoryCard } from "./StoryCard";

/**
 * The two properties that matter on a cover: it themes itself from the world row
 * the API sent (FR-STORY-04) rather than from a branch on a slug, and a story the
 * child has finished says so in a shape on the cover and in words in the button's
 * label, rather than in colour alone.
 */

const SHARING_MONKEY: StorySummaryResponse = {
  id: "story_1",
  slug: "the-sharing-monkey",
  title: "The Sharing Monkey",
  titleAudioUrl: "/dev/story-sharing-monkey.title.en.mp3",
  locale: "en",
  world: {
    id: "world_jungle",
    slug: "jungle",
    name: "Jungle World",
    palette: { primary: "#2E7D32", secondary: "#FDD835" },
    mascot: null,
  },
  coverImageUrl: null,
  pageCount: 5,
  completed: false,
};

function renderCard(story: StorySummaryResponse = SHARING_MONKEY) {
  const onPress = vi.fn();
  render(
    <Providers locale="en">
      <StoryCard story={story} isSelected={false} onPress={onPress} />
    </Providers>,
  );
  return { onPress };
}

describe("StoryCard", () => {
  beforeEach(resetI18nForTests);

  it("accents the cover with the world's own palette", () => {
    renderCard();

    // Jungle is green because the row said so, not because this file knows what
    // a jungle is — adding a fourth world stays a database insert (FR-WORLD-05).
    expect(
      screen
        .getByRole("button", { name: "Read The Sharing Monkey" })
        .querySelector("[style]"),
    ).toHaveStyle({
      backgroundImage: "linear-gradient(160deg, #2E7D32, #FDD835)",
    });
  });

  it("keeps the theme's own surface when the world carries no colours", () => {
    renderCard({
      ...SHARING_MONKEY,
      world: { ...SHARING_MONKEY.world, palette: {} },
    });

    // A malformed palette must not produce `linear-gradient(undefined, …)`.
    expect(
      screen
        .getByRole("button", { name: "Read The Sharing Monkey" })
        .querySelector(".bg-muted"),
    ).toBeInTheDocument();
  });

  it("renders the title at the 20px kid minimum", () => {
    renderCard();

    expect(screen.getByText("The Sharing Monkey")).toHaveClass("text-lg");
  });

  it("badges a finished story with a shape, not colour alone", () => {
    renderCard({ ...SHARING_MONKEY, completed: true });

    // The star is decorative — an `aria-label` on it would be dropped from the
    // name computation by the button's own label, so the words live there and
    // this asserts only what a sighted child sees.
    expect(
      screen
        .getByRole("button", { name: /^Read The Sharing Monkey again/ })
        .querySelector(".fill-accent"),
    ).toBeInTheDocument();
  });

  it("says in the button's own label that the story is finished", () => {
    renderCard({ ...SHARING_MONKEY, completed: true });

    // A screen reader announces the button and stops there, so a completion the
    // button does not name is a completion nobody hears.
    expect(
      screen.getByRole("button", {
        name: "Read The Sharing Monkey again — you finished this one",
      }),
    ).toBeInTheDocument();
  });

  it("shows no badge on a story the child has not finished", () => {
    renderCard();

    const card = screen.getByRole("button", {
      name: "Read The Sharing Monkey",
    });
    expect(card.querySelector(".fill-accent")).not.toBeInTheDocument();
  });

  it("stays fully tappable once completed, because replays are free", () => {
    const { onPress } = renderCard({ ...SHARING_MONKEY, completed: true });

    const card = screen.getByRole("button", {
      name: /^Read The Sharing Monkey again/,
    });
    expect(card).not.toBeDisabled();
    fireEvent.click(card);

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("treats the cover art as decorative so the title carries the meaning", () => {
    renderCard({
      ...SHARING_MONKEY,
      coverImageUrl: "/dev/story-sharing-monkey.png",
    });

    const card = screen.getByRole("button", {
      name: "Read The Sharing Monkey",
    });
    expect(card.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("announces the selected state rather than showing it in colour alone", () => {
    render(
      <Providers locale="en">
        <StoryCard story={SHARING_MONKEY} isSelected onPress={vi.fn()} />
      </Providers>,
    );

    const card = screen.getByRole("button", {
      name: "Read The Sharing Monkey",
    });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveClass("border-primary");
  });

  it("names the story in the child's language", () => {
    render(
      <Providers locale="bn">
        <StoryCard
          story={{ ...SHARING_MONKEY, title: "ভাগ করে নেওয়া বানর", locale: "bn" }}
          isSelected={false}
          onPress={vi.fn()}
        />
      </Providers>,
    );

    // The title is resolved server-side; the label template around it is
    // i18next's.
    expect(
      screen.getByRole("button", { name: "ভাগ করে নেওয়া বানর পড়ো" }),
    ).toBeInTheDocument();
  });
});
