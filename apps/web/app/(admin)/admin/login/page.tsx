import { redirect } from "next/navigation";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";

// Sign-in moved to a dialog on the homepage; this keeps bookmarks and old links working.
export default function AdminLoginPage() {
  redirect(ADMIN_ROUTES.login);
}
