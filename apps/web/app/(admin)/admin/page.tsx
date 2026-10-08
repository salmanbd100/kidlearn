import { redirect } from "next/navigation";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";

export default function AdminIndexPage() {
  redirect(ADMIN_ROUTES.analytics);
}
