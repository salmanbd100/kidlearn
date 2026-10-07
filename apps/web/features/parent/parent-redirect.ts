import type { ParentSummaryResponse } from "@kidlearn/types";

// Where a parent belongs, given who they are and where they asked to go.

/** `?signin=parent` on the homepage opens the sign-in dialog; it is the only sign-in screen a parent has. */
export const PARENT_SIGN_IN_PARAM = {
  name: "signin",
  value: "parent",
} as const;

export const PARENT_ROUTES = {
  login: `/?${PARENT_SIGN_IN_PARAM.name}=${PARENT_SIGN_IN_PARAM.value}`,
  /** Kept as a redirect to `login`, so links to the retired sign-in page still land. */
  legacyLogin: "/parent/login",
  consent: "/parent/onboarding/consent",
  firstChild: "/parent/onboarding/child",
  /** The progress dashboard, and where the Google callback lands. */
  dashboard: "/parent",
  /** The weekly report card and its history. */
  reports: "/parent/reports",
  children: "/parent/children",
} as const;

/** What the layout knows about the visitor. `undefined` parent = signed out. */
export type ParentSessionState = {
  parent: ParentSummaryResponse | undefined;
  childCount: number | undefined;
};

/** The first-run steps, which stop being destinations once onboarding is finished. */
const ONBOARDING_PATHS: readonly string[] = [
  PARENT_ROUTES.consent,
  PARENT_ROUTES.firstChild,
];

export function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.includes(pathname);
}

export function resolveParentRedirect(
  session: ParentSessionState,
  pathname: string,
): string | undefined {
  const { parent, childCount } = session;

  // Sign-in lives on the homepage, outside this group, so no `/parent/*` path is reachable signed out.
  if (!parent) return PARENT_ROUTES.login;

  // Not `consentGivenAt`: consent to an older text is set there too, and the API refuses child-data writes until it is renewed.
  if (!parent.hasCurrentConsent) {
    return pathname === PARENT_ROUTES.consent
      ? undefined
      : PARENT_ROUTES.consent;
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
