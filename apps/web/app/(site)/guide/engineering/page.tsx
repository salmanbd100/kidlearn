import type { Metadata } from "next";
import { EngineeringGuideScreen } from "./EngineeringGuideScreen";

export const metadata: Metadata = {
  title: "Engineering guide — KidLearn",
  description:
    "How KidLearn is built and why: the stack and the alternatives it beat, the architecture, AI content from Gemini and MCP assistants behind a human review gate, and how it is tested and shipped.",
};

export default function EngineeringGuidePage() {
  return <EngineeringGuideScreen />;
}
