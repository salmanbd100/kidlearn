import { resources } from "@kidlearn/i18n";
import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { GuideSection } from "@/features/site/GuideLayout";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import {
  ADMIN_GUIDE_SECTIONS,
  AdminGuideScreen,
} from "./admins/AdminGuideScreen";
import {
  ENGINEERING_GUIDE_SECTIONS,
  EngineeringGuideScreen,
} from "./engineering/EngineeringGuideScreen";
import {
  PARENT_GUIDE_SECTIONS,
  ParentGuideScreen,
} from "./parents/ParentGuideScreen";

/** Reads a dotted key from the English copy, so the assertions follow the strings rather than repeat them. */
function english(key: string): string {
  let node: unknown = resources.en.site;
  for (const part of key.split(".")) {
    node =
      typeof node === "object" && node !== null
        ? Reflect.get(node, part)
        : undefined;
  }
  if (typeof node !== "string") throw new Error(`No English string at ${key}`);
  return node;
}

const GUIDES: readonly {
  name: string;
  Screen: ComponentType;
  sections: readonly GuideSection[];
  bnTitle: string;
}[] = [
  {
    name: "parent",
    Screen: ParentGuideScreen,
    sections: PARENT_GUIDE_SECTIONS,
    bnTitle: "অভিভাবকদের জন্য গাইড",
  },
  {
    name: "admin",
    Screen: AdminGuideScreen,
    sections: ADMIN_GUIDE_SECTIONS,
    bnTitle: "কনটেন্ট অ্যাডমিনদের জন্য গাইড",
  },
  {
    name: "engineering",
    Screen: EngineeringGuideScreen,
    sections: ENGINEERING_GUIDE_SECTIONS,
    bnTitle: "কিডলার্ন কীভাবে তৈরি",
  },
];

describe.each(GUIDES)("$name guide", ({ Screen, sections, bnTitle }) => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("renders its title and every section heading in English", () => {
    render(
      <Providers locale="en">
        <Screen />
      </Providers>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const section of sections) {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: english(section.titleKey),
        }),
      ).toBeInTheDocument();
    }
  });

  it("renders its title in Bangla", () => {
    render(
      <Providers locale="bn">
        <Screen />
      </Providers>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: bnTitle }),
    ).toBeInTheDocument();
  });

  it("renders no raw translation key", () => {
    const { container } = render(
      <Providers locale="en">
        <Screen />
      </Providers>,
    );

    expect(container.textContent).not.toMatch(
      /\b(parents|admins|engineering|diagrams|guide)\.[a-zA-Z]+\.[a-zA-Z]/,
    );
  });
});

describe("admin guide", () => {
  it("states the human-review rule before the first section", () => {
    resetI18nForTests();
    render(
      <Providers locale="en">
        <AdminGuideScreen />
      </Providers>,
    );

    const lead = screen.getByText(/nothing an AI drafts reaches a child/);
    const firstSection = screen.getByRole("region", {
      name: english("admins.account.title"),
    });
    expect(
      lead.compareDocumentPosition(firstSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
