import { MediaScreen } from "./MediaScreen";
import { VideoWorkflowCallout } from "./VideoWorkflowCallout";

export default function AdminMediaPage() {
  return <MediaScreen videoWorkflow={<VideoWorkflowCallout />} />;
}
