import { AiQueueScreen } from "./AiQueueScreen";

/**
 * `/admin/ai-queue` — the human gate FR-AI-07 makes a hard requirement
 * (file 37, FR-CMS-05).
 *
 * A Server Component wrapper around a client screen, matching the rest of the
 * CMS — see the recorded exception in `frontend.md §2`.
 */
export default function AdminAiQueuePage() {
  return <AiQueueScreen />;
}
