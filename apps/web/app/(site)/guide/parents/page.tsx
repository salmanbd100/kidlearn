import type { Metadata } from "next";
import { ParentGuideScreen } from "./ParentGuideScreen";

export const metadata: Metadata = {
  title: "Parent guide — KidLearn",
  description:
    "How to set up KidLearn, what your child does in it, how to follow their progress, how we keep children safe, and how to delete your data.",
};

export default function ParentGuidePage() {
  return <ParentGuideScreen />;
}
