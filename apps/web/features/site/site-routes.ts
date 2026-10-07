/** Public, unauthenticated pages — not part of the Student Portal, so no `(student)` screen links here (NFR-SAFE-07). */
export const SITE_ROUTES = {
  home: "/",
  parentGuide: "/guide/parents",
  adminGuide: "/guide/admins",
  engineeringGuide: "/guide/engineering",
} as const;

export const REPO_URL = "https://github.com/salmanbd100/kidlearn";

/** `path` is relative to `document/`, optionally with a `#anchor`. */
export function REPO_DOC_URL(path: string): string {
  return `${REPO_URL}/blob/main/document/${path}`;
}
