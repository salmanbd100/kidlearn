import { StoriesScreen } from "./StoriesScreen";

/**
 * `/admin/stories` — the story section (file 35, FR-AI-02).
 *
 * A Server Component wrapper around a client screen, matching the rest of the
 * CMS — see the recorded exception in `frontend.md §2`.
 */
export default function AdminStoriesPage() {
  return <StoriesScreen />;
}
