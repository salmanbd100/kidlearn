import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { AdminSidebar } from "./AdminSidebar";

describe("AdminSidebar", () => {
  it("renders exactly the six CMS sections, in order", () => {
    render(<AdminSidebar pathname={ADMIN_ROUTES.analytics} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Curriculum",
      "Stories",
      "Media",
      "Badges",
      "AI Queue",
      "Analytics",
    ]);
  });

  it("points each section at its own route", () => {
    render(<AdminSidebar pathname={ADMIN_ROUTES.analytics} />);

    expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute(
      "href",
      ADMIN_ROUTES.curriculum,
    );
    expect(screen.getByRole("link", { name: "AI Queue" })).toHaveAttribute(
      "href",
      ADMIN_ROUTES.aiQueue,
    );
  });

  it("marks the current section with aria-current, not colour alone", () => {
    render(<AdminSidebar pathname={ADMIN_ROUTES.curriculum} />);

    // Meaning is never carried by colour alone; the active item must be announced.
    expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Analytics" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a section active on its detail pages", () => {
    // Routes under a section must keep the rail lit.
    render(<AdminSidebar pathname={`${ADMIN_ROUTES.curriculum}/lesson/abc`} />);

    expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not treat a sibling route as a section match", () => {
    render(<AdminSidebar pathname="/admin/media-library" />);

    // `startsWith` without the boundary check would light up Media here.
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
  });

  it("renders the signed-in admin's footer when one is given", () => {
    render(
      <AdminSidebar
        pathname={ADMIN_ROUTES.analytics}
        footer={<span>Reviewer One</span>}
      />,
    );

    expect(screen.getByText("Reviewer One")).toBeInTheDocument();
  });
  describe("the AI Queue badge", () => {
    it("shows the count on the AI Queue item", () => {
      render(
        <AdminSidebar
          pathname={ADMIN_ROUTES.analytics}
          badges={{ [ADMIN_ROUTES.aiQueue]: 3 }}
        />,
      );

      expect(screen.getByRole("link", { name: /AI Queue/ })).toHaveTextContent(
        "3",
      );
    });

    it("says what the number counts, not just the number", () => {
      // "AI Queue 3" alone tells a screen-reader user nothing about the 3.
      render(
        <AdminSidebar
          pathname={ADMIN_ROUTES.analytics}
          badges={{ [ADMIN_ROUTES.aiQueue]: 3 }}
        />,
      );

      expect(screen.getByText("3 jobs awaiting review")).toBeInTheDocument();
    });

    it("reads as one job in the singular", () => {
      render(
        <AdminSidebar
          pathname={ADMIN_ROUTES.analytics}
          badges={{ [ADMIN_ROUTES.aiQueue]: 1 }}
        />,
      );

      expect(screen.getByText("1 job awaiting review")).toBeInTheDocument();
    });

    it("renders nothing at zero, so an empty queue is silent", () => {
      render(
        <AdminSidebar
          pathname={ADMIN_ROUTES.analytics}
          badges={{ [ADMIN_ROUTES.aiQueue]: 0 }}
        />,
      );

      expect(
        screen.getByRole("link", { name: "AI Queue" }),
      ).toBeInTheDocument();
    });

    it("leaves the other sections unbadged", () => {
      render(
        <AdminSidebar
          pathname={ADMIN_ROUTES.analytics}
          badges={{ [ADMIN_ROUTES.aiQueue]: 3 }}
        />,
      );

      expect(
        screen.getByRole("link", { name: "Curriculum" }),
      ).toBeInTheDocument();
    });
  });
});
