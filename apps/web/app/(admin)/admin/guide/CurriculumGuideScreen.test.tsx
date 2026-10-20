import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDE_SECTIONS } from "@/features/admin/guide/guide-sections";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { CurriculumGuideScreen } from "./CurriculumGuideScreen";

describe("CurriculumGuideScreen", () => {
  it("renders every section the contents list links to", () => {
    const { container } = render(<CurriculumGuideScreen />);

    for (const section of GUIDE_SECTIONS) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
      expect(
        screen.getByRole("heading", { level: 2, name: section.title }),
      ).toBeInTheDocument();
    }
  });

  it("points every contents link at a section on the page", () => {
    const { container } = render(<CurriculumGuideScreen />);

    for (const nav of screen.getAllByRole("navigation", {
      name: "On this page",
    })) {
      const links = within(nav).getAllByRole("link");
      expect(links).toHaveLength(GUIDE_SECTIONS.length);
      for (const link of links) {
        const href = link.getAttribute("href") ?? "";
        expect(container.querySelector(href)).not.toBeNull();
      }
    }
  });

  describe("opened at a section link", () => {
    afterEach(() => {
      window.history.replaceState(null, "", "/");
      vi.restoreAllMocks();
    });

    it("scrolls to that section once the page has rendered", () => {
      window.history.replaceState(null, "", "/admin/guide#troubleshooting");
      const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");

      render(<CurriculumGuideScreen />);

      expect(scrollIntoView.mock.contexts).toContain(
        document.getElementById("troubleshooting"),
      );
    });
  });

  it("links back to the curriculum", () => {
    render(<CurriculumGuideScreen />);

    expect(
      screen.getByRole("link", { name: "Open curriculum" }),
    ).toHaveAttribute("href", ADMIN_ROUTES.curriculum);
  });
});
