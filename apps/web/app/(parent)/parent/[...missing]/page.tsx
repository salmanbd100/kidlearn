import { notFound } from "next/navigation";

/** Without it the root 404 answers outside the parent layout, in the kid theme. */
export default function MissingParentPage() {
  notFound();
}
