import { redirect } from "next/navigation";

/**
 * The app's front door.
 *
 * A child opening kidlearn goes straight to "Who's learning today?" — there is no
 * marketing page, no sign-in wall they could read, and nothing to decide before
 * picking a face. If nobody has connected the device to an account yet,
 * `/select-profile` is what sends the grown-up to sign in.
 *
 * This replaces the shell showcase that stood here while files 13–14 were built.
 */
export default function StudentRootPage() {
  redirect("/select-profile");
}
