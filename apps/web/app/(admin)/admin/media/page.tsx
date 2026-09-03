import { MediaScreen } from "./MediaScreen";
import { VideoWorkflowCallout } from "./VideoWorkflowCallout";

/**
 * `/admin/media` — the media library and the character sheets (files 33 and 36,
 * FR-CMS-02, FR-AI-06, FR-AI-09).
 *
 * A Server Component wrapper around a client screen, matching the rest of the
 * CMS: the admin session cookie belongs to the API origin, so a Server Component
 * fetching `/api/admin/media` would send no credentials and get a `401` (see the
 * recorded exception in `frontend.md §2`).
 *
 * The video-workflow callout is passed in rather than imported by the screen. It
 * is static prose with no interactivity, so rendering it here keeps it out of the
 * client bundle.
 */
export default function AdminMediaPage() {
  return <MediaScreen videoWorkflow={<VideoWorkflowCallout />} />;
}
