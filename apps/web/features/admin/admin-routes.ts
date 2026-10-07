/** `?signin=admin` on the homepage opens the CMS sign-in dialog; there is no sign-in page. */
export const ADMIN_SIGN_IN_PARAM = { name: "signin", value: "admin" } as const;

export const ADMIN_ROUTES = {
  login: `/?${ADMIN_SIGN_IN_PARAM.name}=${ADMIN_SIGN_IN_PARAM.value}`,
  analytics: "/admin/analytics",
  curriculum: "/admin/curriculum",
  stories: "/admin/stories",
  media: "/admin/media",
  badges: "/admin/badges",
  aiQueue: "/admin/ai-queue",
} as const;

export type AdminNavGroup = "content" | "review" | "insights";

export interface AdminNavItem {
  href: string;
  label: string;
  group: AdminNavGroup;
}

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  content: "Content",
  review: "Review",
  insights: "Insights",
};

/** The sidebar, in order; consecutive items of one group render under one heading. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_ROUTES.curriculum, label: "Curriculum", group: "content" },
  { href: ADMIN_ROUTES.stories, label: "Stories", group: "content" },
  { href: ADMIN_ROUTES.media, label: "Media", group: "content" },
  { href: ADMIN_ROUTES.badges, label: "Badges", group: "content" },
  { href: ADMIN_ROUTES.aiQueue, label: "AI Queue", group: "review" },
  { href: ADMIN_ROUTES.analytics, label: "Analytics", group: "insights" },
];

export function activeAdminNavHref(pathname: string): string | undefined {
  return ADMIN_NAV.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}
