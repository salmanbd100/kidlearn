import { AiQueueScreen } from "./AiQueueScreen";

/**
 * `/admin/ai-queue` — the human gate FR-AI-07 makes a hard requirement
 * (file 37, FR-CMS-05).
 */
export default function AdminAiQueuePage() {
  return <AiQueueScreen />;
}
