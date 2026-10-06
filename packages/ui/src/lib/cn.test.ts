import { describe, expect, it } from "vitest";
import { buttonVariants } from "../primitives/button";
import { cn } from "./cn";

describe("cn", () => {
  it("merges the tokens.css radius and shadow keys with the classes they override", () => {
    expect(
      cn(
        "rounded-[var(--radius)] shadow-md h-11",
        "h-16 rounded-pill shadow-pop",
      ),
    ).toBe("h-16 rounded-pill shadow-pop");
  });

  it("lets a later default-scale class override a design-system one", () => {
    expect(cn("rounded-pill shadow-pop", "rounded-md shadow-sm")).toBe(
      "rounded-md shadow-sm",
    );
  });

  it("keeps the overridden text size but not the colour when they share a prefix", () => {
    expect(cn("text-base text-foreground", "text-lg")).toBe(
      "text-foreground text-lg",
    );
  });

  it("ships the kid button with one radius and one shadow", () => {
    const classes = cn(buttonVariants({ size: "kid" })).split(" ");
    expect(classes.filter((c) => c.startsWith("rounded-"))).toEqual([
      "rounded-pill",
    ]);
    expect(classes.filter((c) => /^shadow-(?:sm|md|lg|pop)$/.test(c))).toEqual([
      "shadow-pop",
    ]);
  });
});
