import type { WorldSummaryResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { WorldCard, worldGradientStyle } from "./WorldCard";

/**
 * FR-WORLD-05 is the whole point of this component: a world looks the way it does
 * because of the row that describes it, so these assertions are about the styling
 * tracing back to `world.palette` and never to a branch on `world.slug`.
 */

const JUNGLE: WorldSummaryResponse = {
  id: "world_jungle",
  slug: "jungle",
  name: "Jungle World",
  palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
  mascot: null,
};

function renderCard(
  world: WorldSummaryResponse = JUNGLE,
  onPress = vi.fn(),
): { onPress: () => void } {
  render(
    <Providers locale="en">
      <WorldCard world={world} onPress={onPress} />
    </Providers>,
  );
  return { onPress };
}

describe("WorldCard", () => {
  beforeEach(resetI18nForTests);

  it("paints itself from the palette the API sent", () => {
    renderCard();

    expect(
      screen.getByRole("button", { name: "Go to Jungle World" }),
    ).toHaveStyle({
      backgroundImage: "linear-gradient(160deg, #2E7D32, #FDD835)",
    });
  });

  it("renders a world it has never heard of", () => {
    // Adding Space World must be a database row, not a code change.
    renderCard({
      id: "world_space",
      slug: "space",
      name: "Space World",
      palette: { primary: "#1A237E", secondary: "#7E57C2" },
      mascot: null,
    });

    expect(
      screen.getByRole("button", { name: "Go to Space World" }),
    ).toHaveStyle({
      backgroundImage: "linear-gradient(160deg, #1A237E, #7E57C2)",
    });
  });

  it("falls back to the theme's own surface when the palette has no colours", () => {
    renderCard({ ...JUNGLE, palette: {} });

    // A malformed palette must not produce `linear-gradient(undefined, ...)`.
    expect(worldGradientStyle({})).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "Go to Jungle World" }),
    ).toHaveClass("bg-card");
  });

  it("uses one colour twice rather than dropping a half-filled palette", () => {
    expect(worldGradientStyle({ primary: "#0277BD" })).toEqual({
      backgroundImage: "linear-gradient(160deg, #0277BD, #0277BD)",
    });
  });

  it("opens the world when tapped", () => {
    const { onPress } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Go to Jungle World" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("names the world in the child's language", () => {
    render(
      <Providers locale="bn">
        <WorldCard world={{ ...JUNGLE, name: "জঙ্গল জগৎ" }} onPress={vi.fn()} />
      </Providers>,
    );

    // The name itself is resolved server-side to the child's locale; the label
    // template around it is the part i18next owns.
    expect(
      screen.getByRole("button", { name: "জঙ্গল জগৎ-এ যাও" }),
    ).toBeInTheDocument();
  });
});
