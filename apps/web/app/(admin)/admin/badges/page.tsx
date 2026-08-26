import { BadgesScreen } from "./BadgesScreen";

/**
 * `/admin/badges` — the badge manager (file 33, FR-GAM-04).
 *
 * A Server Component wrapper around a client screen, matching the rest of the
 * CMS — see the recorded exception in `frontend.md §2`.
 */
export default function AdminBadgesPage() {
  return <BadgesScreen />;
}
