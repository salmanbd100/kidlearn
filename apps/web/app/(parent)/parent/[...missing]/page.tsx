import { notFound } from "next/navigation";

/**
 * Any `/parent/*` URL no route claims. Without it the root 404 answers, outside
 * the parent layout and in the kid theme; `notFound()` here renders the group's
 * own.
 */
export default function MissingParentPage() {
  notFound();
}
