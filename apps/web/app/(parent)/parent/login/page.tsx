import { redirect } from "next/navigation";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";

// Sign-in moved to a dialog on the homepage; this keeps bookmarks and old links working.
export default function ParentLoginPage() {
  redirect(PARENT_ROUTES.login);
}
