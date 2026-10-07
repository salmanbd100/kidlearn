import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { GuideLayout, type GuideSection } from "./GuideLayout";
import { GuideText } from "./GuideProse";

const SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    titleKey: "parents.start.title",
    docPath: "user-journey-manual.md#51-first-time-setup",
    content: <GuideText i18nKey="parents.start.p1" />,
  },
  {
    id: "language",
    titleKey: "parents.language.title",
    content: <GuideText i18nKey="parents.language.p1" />,
  },
];

function renderLayout() {
  return render(
    <Providers locale="en">
      <GuideLayout
        readerKey="parents.reader"
        titleKey="parents.title"
        leadKey="parents.lead"
        sections={SECTIONS}
      />
    </Providers>,
  );
}

describe("GuideLayout", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("points every 'On this page' entry at a section with that id", () => {
    const { container } = renderLayout();

    const contents = screen.getByRole("navigation", { name: "On this page" });
    const entries = within(contents).getAllByRole("link");

    expect(entries).toHaveLength(SECTIONS.length);
    for (const entry of entries) {
      const id = entry.getAttribute("href")?.replace(/^#/, "") ?? "";
      expect(container.querySelector(`#${id}`)?.tagName).toBe("SECTION");
    }
  });

  it("labels each section by its heading", () => {
    renderLayout();

    expect(
      screen.getByRole("region", { name: "Getting started" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Language" }),
    ).toBeInTheDocument();
  });

  it("links to the full document on GitHub only where a section has one", () => {
    renderLayout();

    const links = screen.getAllByRole("link", {
      name: /Read the full document/,
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://github.com/salmanbd100/kidlearn/blob/main/document/user-journey-manual.md#51-first-time-setup",
    );
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAccessibleName(
      "Read the full document (opens in a new tab)",
    );
  });
});
