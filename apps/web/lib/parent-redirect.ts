import type { ParentSummaryResponse } from "@kidlearn/types";

/**
 * Where a parent belongs, given who they are and where they asked to go.
 *
 * A pure function on purpose. This is the whole of the first-run gating rule
 * (FR-AUTH-02..04) — "no child profile UI is reachable before consent" is only
 * true if every path through this decision says so — and a rule that lives inside
 * a `useEffect` can be tested only by rendering a router. Extracted, every branch
 * is one assertion.
 */

export const PARENT_ROUTES = {
  login: "/parent/login",
  consent: "/parent/onboarding/consent",
  pinSetup: "/parent/onboarding/pin",
  firstChild: "/parent/onboarding/child",
  children: "/parent/children",
} as const;

/** What the layout knows about the visitor. `undefined` parent = signed out. */
export type ParentSessionState = {
  parent: ParentSummaryResponse | undefined;
  /** How many profiles exist. `undefined` while it is still unknown. */
  childCount: number | undefined;
};

/**
 * Reachable without a session at all. Everything else redirects to login.
 *
 * Only the login screen: the onboarding pages each require an authenticated
 * parent, because consent and the PIN are recorded *against* an account.
 */
const PUBLIC_PATHS: readonly string[] = [PARENT_ROUTES.login];

/**
 * Pages exempt from the PIN gate.
 *
 * Login and the pre-PIN onboarding steps have to be, or the flow deadlocks: the
 * gate asks for a PIN the parent has not created yet. The first-child step is
 * exempt too — the PIN exists by then, but demanding it one screen after it was
 * chosen is a gate that guards nothing and reads as a bug.
 */
const GATE_EXEMPT_PATHS: readonly string[] = [
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

/**
 * The path to redirect to, or `undefined` to render what was asked for.
 *
 * Order is the specification, not an implementation detail:
 *
 *  1. No session → login. Nothing else can be decided without one.
 *  2. No consent → the consent screen (FR-AUTH-03). Checked before the PIN so a
 *     parent cannot be asked to secure an account they have not agreed to open.
 *  3. No PIN → PIN setup (FR-AUTH-04).
 *  4. No children yet → the first-profile form, which is what completes
 *     onboarding (FR-PROF-01).
 *  5. Otherwise, an already-onboarded parent sitting on login or an onboarding
 *     step is sent forward to the profile list rather than shown a step they have
 *     finished.
 *
 * `childCount === undefined` means the list has not loaded. That returns
 * `undefined` (render, don't redirect) rather than guessing: guessing "no
 * children" would bounce every returning parent through the onboarding form for
 * as long as the request took.
 */
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
  return isGateExemptPath(pathname) ? PARENT_ROUTES.children : undefined;
}
