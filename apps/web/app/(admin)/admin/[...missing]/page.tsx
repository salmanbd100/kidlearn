import { notFound } from "next/navigation";

/** Without it the root 404 answers outside the admin shell, in the kid theme. */
export default function MissingAdminPage() {
  notFound();
}
