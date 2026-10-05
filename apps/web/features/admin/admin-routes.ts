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

/** The sidebar, in order. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_ROUTES.curriculum, label: "Curriculum" },
  { href: ADMIN_ROUTES.stories, label: "Stories" },
  { href: ADMIN_ROUTES.media, label: "Media" },
  { href: ADMIN_ROUTES.badges, label: "Badges" },
  { href: ADMIN_ROUTES.aiQueue, label: "AI Queue" },
  { href: ADMIN_ROUTES.analytics, label: "Analytics" },
];

const PUBLIC_PATHS: readonly string[] = [ADMIN_ROUTES.login];

export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

export function activeAdminNavHref(pathname: string): string | undefined {
  return ADMIN_NAV.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}
