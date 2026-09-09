import type { ParentSummaryResponse } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  isOnboardingPath,
  PARENT_ROUTES,
  resolveParentRedirect,
} from "./parent-redirect";

/**
 * The first-run gating rule, asserted as a function rather than by clicking
 * through the app.
 */

function parent(
  overrides: Partial<ParentSummaryResponse> = {},
): ParentSummaryResponse {
  return {
    id: "parent_1",
    email: "parent@example.com",
    name: "Parent One",
    avatarUrl: null,
    consentGivenAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const ALL_PATHS = [
  PARENT_ROUTES.login,
  PARENT_ROUTES.consent,
  PARENT_ROUTES.firstChild,
  PARENT_ROUTES.dashboard,
  PARENT_ROUTES.children,
  "/parent/children/new",
  "/parent/children/abc/edit",
] as const;

describe("resolveParentRedirect — signed out", () => {
  const signedOut = { parent: undefined, childCount: undefined };

  it("lets the login screen render", () => {
    expect(
      resolveParentRedirect(signedOut, PARENT_ROUTES.login),
    ).toBeUndefined();
  });

  it("sends every other path to login, including the onboarding steps", () => {
    for (const path of ALL_PATHS.filter((p) => p !== PARENT_ROUTES.login)) {
      expect(resolveParentRedirect(signedOut, path)).toBe(PARENT_ROUTES.login);
    }
  });
});

describe("resolveParentRedirect — consent missing", () => {
  const noConsent = {
    parent: parent({ consentGivenAt: null }),
    childCount: 0,
  };

  it("lets the consent screen render", () => {
    expect(
      resolveParentRedirect(noConsent, PARENT_ROUTES.consent),
    ).toBeUndefined();
  });

  it("sends every other path to consent — no profile UI is reachable first", () => {
    for (const path of ALL_PATHS.filter((p) => p !== PARENT_ROUTES.consent)) {
      expect(resolveParentRedirect(noConsent, path)).toBe(
        PARENT_ROUTES.consent,
      );
    }
  });

  it("is checked before the profile form, so consent is never asked for second", () => {
    // A parent with neither goes to consent, not to the profile form: creating a
    // child profile on an account nobody has agreed to open is the wrong order.
    const neither = {
      parent: parent({ consentGivenAt: null }),
      childCount: 0,
    };
    expect(resolveParentRedirect(neither, PARENT_ROUTES.firstChild)).toBe(
      PARENT_ROUTES.consent,
    );
  });
});

describe("resolveParentRedirect — no profiles yet", () => {
  const noChildren = { parent: parent(), childCount: 0 };

  it("lets the first-profile form render", () => {
    expect(
      resolveParentRedirect(noChildren, PARENT_ROUTES.firstChild),
    ).toBeUndefined();
  });

  it("sends the profile list to the first-profile form", () => {
    expect(resolveParentRedirect(noChildren, PARENT_ROUTES.children)).toBe(
      PARENT_ROUTES.firstChild,
    );
  });
});

describe("resolveParentRedirect — fully onboarded", () => {
  const onboarded = { parent: parent(), childCount: 2 };

  it("renders the dashboard, the profile list and everything under it", () => {
    expect(
      resolveParentRedirect(onboarded, PARENT_ROUTES.dashboard),
    ).toBeUndefined();
    expect(
      resolveParentRedirect(onboarded, PARENT_ROUTES.children),
    ).toBeUndefined();
    expect(
      resolveParentRedirect(onboarded, "/parent/children/new"),
    ).toBeUndefined();
    expect(
      resolveParentRedirect(onboarded, "/parent/children/abc/edit"),
    ).toBeUndefined();
  });

  it("sends a finished step forward instead of showing it again", () => {
    for (const path of [
      PARENT_ROUTES.login,
      PARENT_ROUTES.consent,
      PARENT_ROUTES.firstChild,
    ]) {
      // The dashboard, not the profile list: a parent signing back in wants to
      // see how their child is doing (file 29).
      expect(resolveParentRedirect(onboarded, path)).toBe(
        PARENT_ROUTES.dashboard,
      );
    }
  });
});

describe("resolveParentRedirect — profiles not loaded yet", () => {
  it("renders rather than guessing that there are none", () => {
    // Guessing "no children" would bounce every returning parent through the
    // onboarding form for as long as the request took.
    const loading = { parent: parent(), childCount: undefined };
    expect(
      resolveParentRedirect(loading, PARENT_ROUTES.children),
    ).toBeUndefined();
  });
});

describe("onboarding paths", () => {
  it("names the two first-run steps and nothing past them", () => {
    expect(isOnboardingPath(PARENT_ROUTES.consent)).toBe(true);
    expect(isOnboardingPath(PARENT_ROUTES.firstChild)).toBe(true);
    expect(isOnboardingPath(PARENT_ROUTES.dashboard)).toBe(false);
    expect(isOnboardingPath(PARENT_ROUTES.children)).toBe(false);
    expect(isOnboardingPath("/parent/children/new")).toBe(false);
  });
});
