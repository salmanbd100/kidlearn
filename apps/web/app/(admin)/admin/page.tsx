import { redirect } from "next/navigation";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/**
 * `/admin` — no page of its own.
 *
 * Analytics is the destination because it is the only section with content at this
 * point (FR-CMS-07 basic); once file 32 lands, Curriculum is the better landing
 * page and this is the one line that changes.
 */
export default function AdminIndexPage() {
  redirect(ADMIN_ROUTES.analytics);
}
