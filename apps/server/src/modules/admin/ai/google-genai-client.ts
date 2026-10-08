import type { GoogleGenAI, SafetySetting } from "@google/genai";
import { env } from "../../../config/env.js";

// Bound a provider call: a hung connection holds the admin's request and job row open until the proxy
// gives up and the admin retries into a second job.
export const PROVIDER_TIMEOUT_MS = 90_000;

// Strictest threshold on every harm category: the audience is 3-6 and human review is a second line, not the first.
// Plain strings, not the SDK enums, which would force a static import of a package loaded lazily.
export const CHILD_SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({
  category,
  threshold: "BLOCK_LOW_AND_ABOVE",
})) as SafetySetting[]; // string literals standing in for the SDK's string enums, which they equal

let clientPromise: Promise<GoogleGenAI> | undefined;

export function getClient(): Promise<GoogleGenAI> {
  clientPromise ??= import("@google/genai")
    .then(
      ({ GoogleGenAI }) =>
        new GoogleGenAI({
          apiKey: env.GEMINI_API_KEY,
          httpOptions: { timeout: PROVIDER_TIMEOUT_MS },
        }),
    )
    .catch((error: unknown) => {
      clientPromise = undefined;
      throw error;
    });
  return clientPromise;
}
