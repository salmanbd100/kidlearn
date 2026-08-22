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
 * Only the pages reachable *before* a PIN exists. Exempting those is not a
 * convenience — without it the flow deadlocks, because the gate would ask for a
 * PIN the parent has not created yet.
 *
 * The first-child step is deliberately **not** exempt, though it once was, on the
 * grounds that demanding a PIN one screen after choosing it guards nothing. That
 * reasoning was right about the prompt and wrong about the exemption: the prompt is
 * gone because `POST /api/parent/pin` now opens the grant as it stores the PIN, so
 * a parent walking the normal path never sees the pad here. What the exemption did
 * was hide the pad in the one case it is needed — `POST /api/children` is
 * PIN-gated on the server, so a grant that did not survive the trip leaves the
 * server refusing a form the client insists is fine.
 */
const GATE_EXEMPT_PATHS: readonly string[] = [
  PARENT_ROUTES.login,
  PARENT_ROUTES.consent,
  PARENT_ROUTES.pinSetup,
];

/**
 * The first-run steps, which stop being destinations once onboarding is finished.
 *
 * A separate list from `GATE_EXEMPT_PATHS`, which it used to share. The two
 * happened to hold the same paths and mean different things — "no PIN can be
 * demanded here yet" and "there is nothing left to do here" — and the day the
 * first-child step left one list it silently left the other, stranding a finished
 * parent on a form they had already completed. Naming both is what stops that
 * recurring.
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
 *     step is sent forward to the dashboard rather than shown a step they have
 *     finished. That destination was the profile list until file 29 gave `/parent`
 *     a screen of its own — a parent signing back in wants to see how their child
 *     is doing, not a list of profiles they are not editing.
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
  return isOnboardingPath(pathname) ? PARENT_ROUTES.dashboard : undefined;
}
