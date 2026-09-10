import type { ParentSummaryResponse } from "@kidlearn/types";

// Where a parent belongs, given who they are and where they asked to go.

export const PARENT_ROUTES = {
  login: "/parent/login",
  consent: "/parent/onboarding/consent",
  pinSetup: "/parent/onboarding/pin",
  firstChild: "/parent/onboarding/child",
  /** The progress dashboard, and where the Google callback lands (file 29). */
  dashboard: "/parent",
  /** The weekly report card and its history (file 30, FR-DASH-05..06). */
  reports: "/parent/reports",
  children: "/parent/children",
} as const;

/** What the layout knows about the visitor. `undefined` parent = signed out. */
export type ParentSessionState = {
  parent: ParentSummaryResponse | undefined;
  /** How many profiles exist. `undefined` while it is still unknown. */
  childCount: number | undefined;
};

/** Reachable without a session at all. Everything else redirects to login. */
const PUBLIC_PATHS: readonly string[] = [PARENT_ROUTES.login];

/** Pages exempt from the PIN gate. */
const GATE_EXEMPT_PATHS: readonly string[] = [
  PARENT_ROUTES.login,
  PARENT_ROUTES.consent,
  PARENT_ROUTES.pinSetup,
];

/**
 * The first-run steps, which stop being destinations once onboarding is finished.
 */
const ONBOARDING_PATHS: readonly string[] = [
  PARENT_ROUTES.login,
  PARENT_ROUTES.consent,
  PARENT_ROUTES.pinSetup,
  PARENT_ROUTES.firstChild,
];

export function isPublicParentPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

export function isGateExemptPath(pathname: string): boolean {
  return GATE_EXEMPT_PATHS.includes(pathname);
}

export function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.includes(pathname);
}

/** The path to redirect to, or `undefined` to render what was asked for. */
export function resolveParentRedirect(
  session: ParentSessionState,
  pathname: string,
): string | undefined {
  const { parent, childCount } = session;

  if (!parent) {
    return isPublicParentPath(pathname) ? undefined : PARENT_ROUTES.login;
  }

  if (parent.consentGivenAt === null) {
    return pathname === PARENT_ROUTES.consent
      ? undefined
      : PARENT_ROUTES.consent;
  }

  if (!parent.hasPin) {
    return pathname === PARENT_ROUTES.pinSetup
      ? undefined
      : PARENT_ROUTES.pinSetup;
  }

  if (childCount === undefined) return undefined;

  if (childCount === 0) {
    return pathname === PARENT_ROUTES.firstChild
      ? undefined
      : PARENT_ROUTES.firstChild;
  }

  // Fully onboarded. The finished steps are no longer destinations.
  return isOnboardingPath(pathname) ? PARENT_ROUTES.dashboard : undefined;
}
