import type { Metadata } from "next";
import { ParentGuideScreen } from "./ParentGuideScreen";

export const metadata: Metadata = {
  title: "Parent guide — KidLearn",
  description:
    "How to set up KidLearn, add a child, read the dashboard and weekly reports, set screen time and delete your data.",
};

export default function ParentGuidePage() {
  return <ParentGuideScreen />;
}
