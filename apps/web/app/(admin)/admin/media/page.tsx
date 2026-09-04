import { MediaScreen } from "./MediaScreen";
import { VideoWorkflowCallout } from "./VideoWorkflowCallout";

/**
 * `/admin/media` — the media library and the character sheets (files 33 and 36,
 * FR-CMS-02, FR-AI-06, FR-AI-09).
 */
export default function AdminMediaPage() {
  return <MediaScreen videoWorkflow={<VideoWorkflowCallout />} />;
}
