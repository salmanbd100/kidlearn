import { StudentGuard } from "@/app/(student)/StudentGuard";
import { StoriesScreen } from "./StoriesScreen";

export default function StoryLibraryPage() {
  return (
    <StudentGuard>
      <StoriesScreen />
    </StudentGuard>
  );
}
