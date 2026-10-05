import { redirect } from "next/navigation";
import { STUDENT_ROUTES } from "@/features/student/student-routes";

export default function StudentRootPage() {
  redirect(STUDENT_ROUTES.selectProfile);
}
