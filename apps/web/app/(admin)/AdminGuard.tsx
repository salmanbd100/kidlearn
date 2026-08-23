"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ADMIN_ROUTES, isPublicAdminPath } from "@/lib/admin-routes";
import { useAdminSession } from "./context/admin-session";

/**
 * The one gate every CMS page sits behind (file 31, spec §4.3).
 *
 * Simpler than `ParentGuard` because there is nothing to onboard: an admin exists
 * or does not, and there is no consent step, no PIN and no first-child flow to
 * sequence. A signed-out visitor — and a signed-in *parent*, which the API answers
 * `403` to — goes to the login screen.
 *
 * Nothing renders while the session is loading. Rendering the shell first would
 * flash a curriculum tree at somebody who turns out not to be an admin, which is a
 * content-safety problem and not only a visual one.
 *
 * This is a convenience, not the security boundary. Every `/api/admin/*` route is
 * guarded server-side by `requireAdmin`, so a parent who ignores this redirect
 * reaches a page whose every request answers `403`.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAdminSession();

  const isPublic = isPublicAdminPath(pathname);
  const shouldRedirect = status === "signedOut" && !isPublic;

  useEffect(() => {
    // `replace`, not `push`: a bounce the admin did not ask for must not become a
    // back-button trap between the CMS and its login screen.
    if (shouldRedirect) router.replace(ADMIN_ROUTES.login);
  }, [shouldRedirect, router]);

  if (isPublic) return <>{children}</>;

  if (status === "loading") {
    return (
      <p role="status" className="p-6 text-muted-foreground text-sm">
        Loading…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" className="p-6 text-destructive text-sm">
        Could not reach the kidlearn API. Check that the server is running.
      </p>
    );
  }

  // A redirect is queued; showing the CMS for a frame would show the wrong thing.
  if (shouldRedirect) return null;

  return <>{children}</>;
}
