import { redirect } from "next/navigation";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/**
 * `/parent` — where the Google callback lands.
 *
 * The server owns that destination (`PARENT_POST_LOGIN_PATH`, default `/parent`),
 * so this route has to exist. It has no screen of its own: everything about where a
 * parent belongs depends on their onboarding state, which only the client can read
 * (see `../context/parent-session.tsx`). So it forwards to the profile list and
 * lets `ParentGuard` do the deciding from there — a signed-out visitor is bounced
 * on to login, a half-onboarded one to the step they stopped at.
 */
export default function ParentIndexPage() {
  redirect(PARENT_ROUTES.children);
}
