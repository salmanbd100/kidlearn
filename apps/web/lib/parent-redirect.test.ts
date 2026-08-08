import type { ParentSummaryResponse } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  isGateExemptPath,
  PARENT_ROUTES,
  resolveParentRedirect,
} from "./parent-redirect";

/**
 * The first-run gating rule, asserted as a function rather than by clicking
 * through the app.
 *
 * "No child profile UI is reachable before consent" (FR-AUTH-03) is a claim about
 * *every* path through this decision, which is why it is worth testing exhaustively
 * here rather than once in a rendered flow.
 */

function parent(
  overrides: Partial<ParentSummaryResponse> = {},
): ParentSummaryResponse {
  return {
    id: "parent_1",
    email: "parent@example.com",
    hasPin: true,
    consentGivenAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const ALL_PATHS = [
  PARENT_ROUTES.login,
  PARENT_ROUTES.consent,
  PARENT_ROUTES.pinSetup,
  PARENT_ROUTES.firstChild,
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

  it("is checked before the PIN, so consent is never asked for second", () => {
    // A parent with neither goes to consent, not to PIN setup: securing an
    // account they have not agreed to open is the wrong order.
    const neither = {
      parent: parent({ consentGivenAt: null, hasPin: false }),
      childCount: 0,
    };
    expect(resolveParentRedirect(neither, PARENT_ROUTES.pinSetup)).toBe(
      PARENT_ROUTES.consent,
    );
  });
});

describe("resolveParentRedirect — PIN missing", () => {
  const noPin = { parent: parent({ hasPin: false }), childCount: 0 };

  it("lets PIN setup render", () => {
    expect(
      resolveParentRedirect(noPin, PARENT_ROUTES.pinSetup),
    ).toBeUndefined();
  });

  it("sends the profile list to PIN setup", () => {
    expect(resolveParentRedirect(noPin, PARENT_ROUTES.children)).toBe(
      PARENT_ROUTES.pinSetup,
    );
  });

  it("does not let a consented parent go back to the consent screen", () => {
    expect(resolveParentRedirect(noPin, PARENT_ROUTES.consent)).toBe(
      PARENT_ROUTES.pinSetup,
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

  it("renders the profile list and everything under it", () => {
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
      PARENT_ROUTES.pinSetup,
      PARENT_ROUTES.firstChild,
    ]) {
      expect(resolveParentRedirect(onboarded, path)).toBe(
        PARENT_ROUTES.children,
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

describe("gate exemptions", () => {
  it("exempts login and every onboarding step", () => {
    expect(isGateExemptPath(PARENT_ROUTES.login)).toBe(true);
    expect(isGateExemptPath(PARENT_ROUTES.consent)).toBe(true);
    expect(isGateExemptPath(PARENT_ROUTES.pinSetup)).toBe(true);
    // Exempt too: the PIN exists by then, but asking for it one screen after it
    // was chosen guards nothing.
    expect(isGateExemptPath(PARENT_ROUTES.firstChild)).toBe(true);
  });

  it("does not exempt the profile list or its sub-pages", () => {
    expect(isGateExemptPath(PARENT_ROUTES.children)).toBe(false);
    expect(isGateExemptPath("/parent/children/new")).toBe(false);
  });
});
