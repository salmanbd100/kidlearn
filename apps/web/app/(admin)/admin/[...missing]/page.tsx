import { notFound } from "next/navigation";

/**
 * Any `/admin/*` URL no route claims. Without it the root 404 answers, outside
 * the admin shell and in the kid theme; `notFound()` here renders the CMS's own.
 */
export default function MissingAdminPage() {
  notFound();
}
