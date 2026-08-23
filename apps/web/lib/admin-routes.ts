/**
 * The admin CMS's routing table (file 31, FR-CMS-01).
 *
 * A module of plain data rather than a list inside the sidebar component, for the
 * reason `lib/parent-redirect.ts` gives about the parent gate: "the sidebar has
 * exactly these six sections and never 404s" is a claim about a set, and a set
 * declared next to the markup that renders it can only be tested by rendering.
 *
 * **Labels are English-only at MVP, deliberately.** FR-I18N covers the child and
 * parent surfaces; the CMS is an internal tool used by the team, so wiring a
 * fourth i18next namespace for it would cost a Bangla translation of "AI Queue"
 * that nobody has asked for. If an outside reviewer is ever onboarded, this is the
 * one file that has to change.
 */

export const ADMIN_ROUTES = {
  login: "/admin/login",
  analytics: "/admin/analytics",
  curriculum: "/admin/curriculum",
  stories: "/admin/stories",
  media: "/admin/media",
  badges: "/admin/badges",
  aiQueue: "/admin/ai-queue",
} as const;

export interface AdminNavItem {
  href: string;
  label: string;
}

/**
 * The sidebar, in order. Exactly six — the spec's §4.3 surface, no more.
 *
 * Curriculum leads because it is what an admin opens the CMS to do; Analytics is
 * last because it is the only read-only one, and also the only one that exists
 * yet. `/admin` redirects to Analytics for that reason and no other.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_ROUTES.curriculum, label: "Curriculum" },
  { href: ADMIN_ROUTES.stories, label: "Stories" },
  { href: ADMIN_ROUTES.media, label: "Media" },
  { href: ADMIN_ROUTES.badges, label: "Badges" },
  { href: ADMIN_ROUTES.aiQueue, label: "AI Queue" },
  { href: ADMIN_ROUTES.analytics, label: "Analytics" },
];

/**
 * Reachable without an admin session.
 *
 * Only the login screen. There is no signup, no forgot-password flow and no
 * invitation flow to exempt — an admin exists because the seed script created one.
 */
const PUBLIC_PATHS: readonly string[] = [ADMIN_ROUTES.login];

export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * Which nav item a path belongs to, or `undefined` outside the CMS.
 *
 * Prefix-matched rather than compared, so a detail page a later file adds
 * (`/admin/curriculum/lesson/abc`) still lights up Curriculum. The boundary check
 * is what keeps `/admin/media-library` from matching `/admin/media`.
 */
export function activeAdminNavHref(pathname: string): string | undefined {
  return ADMIN_NAV.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}
