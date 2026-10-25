import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { type GuideTab, GuideTabs } from "./GuideTabs";

const TABS: GuideTab[] = [
  {
    id: "web",
    labelKey: "engineering.stack.web.tab",
    content: <p>Web body</p>,
  },
  {
    id: "api",
    labelKey: "engineering.stack.api.tab",
    content: <p>API body</p>,
  },
  {
    id: "database",
    labelKey: "engineering.stack.database.tab",
    content: <p>Database body</p>,
  },
];

function renderTabs() {
  return render(
    <Providers locale="en">
      <h2 id="stack-title">The stack</h2>
      <GuideTabs id="stack" labelledBy="stack-title" tabs={TABS} />
    </Providers>,
  );
}

describe("GuideTabs", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("labels the tab list by the section heading and shows the first panel", () => {
    renderTabs();

    expect(
      screen.getByRole("tablist", { name: "The stack" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Web" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel", { name: "Web" })).toHaveTextContent(
      "Web body",
    );
    expect(screen.getByText("API body")).not.toBeVisible();
  });

  it("switches panel on click", () => {
    renderTabs();

    fireEvent.click(screen.getByRole("tab", { name: "API" }));

    expect(screen.getByText("API body")).toBeVisible();
    expect(screen.getByText("Web body")).not.toBeVisible();
  });

  it("moves selection and focus with the arrow, Home and End keys, wrapping at the ends", () => {
    renderTabs();
    const web = screen.getByRole("tab", { name: "Web" });
    const database = screen.getByRole("tab", { name: "Database" });

    fireEvent.keyDown(web, { key: "ArrowLeft" });
    expect(database).toHaveFocus();
    expect(database).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(database, { key: "ArrowRight" });
    expect(web).toHaveFocus();

    fireEvent.keyDown(web, { key: "End" });
    expect(database).toHaveFocus();

    fireEvent.keyDown(database, { key: "Home" });
    expect(web).toHaveFocus();
  });

  it("leaves closed panels reachable by find-in-page", () => {
    renderTabs();

    expect(
      screen.getByText("API body").closest('[role="tabpanel"]'),
    ).toHaveAttribute("hidden", "until-found");
    expect(
      screen.getByText("Web body").closest('[role="tabpanel"]'),
    ).not.toHaveAttribute("hidden");
  });

  it("opens the tab whose panel a find-in-page match reveals", () => {
    renderTabs();

    const panel = screen
      .getByText("Database body")
      .closest('[role="tabpanel"]');
    act(() => {
      panel?.dispatchEvent(new Event("beforematch"));
    });

    expect(screen.getByRole("tab", { name: "Database" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Database body")).toBeVisible();
    expect(
      screen.getByText("Web body").closest('[role="tabpanel"]'),
    ).toHaveAttribute("hidden", "until-found");
  });

  it("keeps only the selected tab in the tab order", () => {
    renderTabs();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.getAttribute("tabindex")),
    ).toEqual(["0", "-1", "-1"]);
  });
});
