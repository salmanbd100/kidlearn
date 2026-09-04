import { redirect } from "next/navigation";

/** The app's front door. */
export default function StudentRootPage() {
  redirect("/select-profile");
}
