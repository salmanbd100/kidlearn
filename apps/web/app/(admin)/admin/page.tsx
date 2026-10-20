import { redirect } from "next/navigation";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";

export default function AdminIndexPage() {
  redirect(ADMIN_ROUTES.analytics);
}
