import { MediaScreen } from "./MediaScreen";

/**
 * `/admin/media` — the media library (file 33, FR-CMS-02).
 *
 * A Server Component wrapper around a client screen, matching the rest of the
 * CMS: the admin session cookie belongs to the API origin, so a Server Component
 * fetching `/api/admin/media` would send no credentials and get a `401` (see the
 * recorded exception in `frontend.md §2`).
 */
export default function AdminMediaPage() {
  return <MediaScreen />;
}
