import type { ParentSummaryResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParentAvatar, parentInitials } from "./ParentAvatar";

/**
 * Both fields Google fills in here are nullable, and the photo can 404 long
 * after sign-in, so every path through this component ends somewhere readable.
 */

function parent(
  overrides: Partial<ParentSummaryResponse> = {},
): ParentSummaryResponse {
  return {
    id: "parent_1",
    email: "salman@example.com",
    name: "Salman Rahman",
    avatarUrl: null,
    hasPin: true,
    consentGivenAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parentInitials", () => {
  it("takes the first and last word of a full name", () => {
    expect(parentInitials(parent({ name: "Salman Rahman" }))).toBe("SR");
  });

  it("skips the middle names rather than running past two letters", () => {
    expect(parentInitials(parent({ name: "Md Salman Rahman" }))).toBe("MR");
  });

  it("uses the single letter available for a one-word name", () => {
    expect(parentInitials(parent({ name: "Salman" }))).toBe("S");
  });

  it("falls back to the email, the one field that is never null", () => {
    expect(parentInitials(parent({ name: null }))).toBe("S");
  });

  it("treats a whitespace-only name as no name at all", () => {
    expect(parentInitials(parent({ name: "   " }))).toBe("S");
  });
});

describe("ParentAvatar", () => {
  it("renders the photo when there is one", () => {
    render(
      <ParentAvatar
        parent={parent({
          avatarUrl: "https://lh3.googleusercontent.com/a/photo=s96-c",
        })}
      />,
    );

    expect(document.querySelector("img")).not.toBeNull();
  });

  it("falls back to initials when the photo fails to load", () => {
    render(
      <ParentAvatar
        parent={parent({
          avatarUrl: "https://lh3.googleusercontent.com/a/gone=s96-c",
        })}
      />,
    );

    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    // A photo the account has since removed 404s, and a broken-image icon beside
    // a name reads as an error rather than as "no photo set".
    if (image) fireEvent.error(image);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("SR")).toBeInTheDocument();
  });
});
