import { StudentGuard } from "@/app/(student)/StudentGuard";
import { HomeScreen } from "./HomeScreen";

export default function StudentHomeScreenPage() {
  return (
    <StudentGuard>
      <HomeScreen />
    </StudentGuard>
  );
}
