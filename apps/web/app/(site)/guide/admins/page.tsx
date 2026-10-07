import type { Metadata } from "next";
import { AdminGuideScreen } from "./AdminGuideScreen";

export const metadata: Metadata = {
  title: "Admin guide — KidLearn",
  description:
    "What the KidLearn CMS is for, how content reaches a child, the human review rule and what an admin cannot do.",
};

export default function AdminGuidePage() {
  return <AdminGuideScreen />;
}
