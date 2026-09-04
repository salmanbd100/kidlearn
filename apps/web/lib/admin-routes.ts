// The admin CMS's routing table (file 31, FR-CMS-01).

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

/** The sidebar, in order. Exactly six — the spec's §4.3 surface, no more. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_ROUTES.curriculum, label: "Curriculum" },
  { href: ADMIN_ROUTES.stories, label: "Stories" },
  { href: ADMIN_ROUTES.media, label: "Media" },
  { href: ADMIN_ROUTES.badges, label: "Badges" },
  { href: ADMIN_ROUTES.aiQueue, label: "AI Queue" },
  { href: ADMIN_ROUTES.analytics, label: "Analytics" },
];

/** Reachable without an admin session. */
const PUBLIC_PATHS: readonly string[] = [ADMIN_ROUTES.login];

export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

/** Which nav item a path belongs to, or `undefined` outside the CMS. */
export function activeAdminNavHref(pathname: string): string | undefined {
  return ADMIN_NAV.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}
