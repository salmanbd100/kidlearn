import type { Metadata } from "next";
import { HomeScreen } from "./HomeScreen";

export const metadata: Metadata = {
  title: "KidLearn — early learning in English and Bangla",
  description:
    "A playful learning app for children aged three to six, with a calm dashboard for their parents. Start learning, sign in as a parent, or read the guides.",
};

export default function HomePage() {
  return <HomeScreen />;
}
