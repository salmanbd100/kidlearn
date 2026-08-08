import { StudentGuard } from "../StudentGuard";
import { HomeScreen } from "./HomeScreen";

/** The world-themed student home (FR-WORLD-01..03). */
export default function StudentHomeScreenPage() {
  return (
    <StudentGuard>
      <HomeScreen />
    </StudentGuard>
  );
}
