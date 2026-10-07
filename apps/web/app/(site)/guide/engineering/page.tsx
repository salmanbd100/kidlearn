import type { Metadata } from "next";
import { EngineeringGuideScreen } from "./EngineeringGuideScreen";

export const metadata: Metadata = {
  title: "Engineering guide — KidLearn",
  description:
    "How KidLearn is built and why: the monorepo, a request end to end, content as data, the human publishing gate, and how it is tested and shipped.",
};

export default function EngineeringGuidePage() {
  return <EngineeringGuideScreen />;
}
