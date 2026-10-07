/** `?signin=admin` on the homepage opens the CMS sign-in dialog; there is no sign-in page. */
export const ADMIN_SIGN_IN_PARAM = { name: "signin", value: "admin" } as const;

export const ADMIN_ROUTES = {
  login: `/?${ADMIN_SIGN_IN_PARAM.name}=${ADMIN_SIGN_IN_PARAM.value}`,
  /** Kept as a redirect to `login`, so links to the retired sign-in page still land. */
  legacyLogin: "/admin/login",
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

export function activeAdminNavHref(pathname: string): string | undefined {
  return ADMIN_NAV.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}
