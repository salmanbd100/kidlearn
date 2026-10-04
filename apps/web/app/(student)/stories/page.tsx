import { StudentGuard } from "@/app/(student)/StudentGuard";
import { StoriesScreen } from "./StoriesScreen";

/** The story library, reachable from the main menu at any time (FR-STORY-01). */
export default function StoryLibraryPage() {
  return (
    <StudentGuard>
      <StoriesScreen />
    </StudentGuard>
  );
}
