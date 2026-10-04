import type { GoogleGenAI, SafetySetting } from "@google/genai";
import { env } from "../../../config/env.js";

/**
 * The one `@google/genai` client, shared by the text generators (file 37a) and
 * the illustration model (file 36) — one key, two models, one construction.
 */
/**
 * How long one provider call may take. Without a bound a hung connection holds
 * the admin's request, and the job row, open until the proxy gives up and the
 * admin retries into a second job.
 */
export const PROVIDER_TIMEOUT_MS = 90_000;

/**
 * The strictest block threshold on every harm category the API offers. The
 * audience is three to six years old and the human review that follows is a
 * second line, not the first: a model default tuned for a general audience would
 * let borderline text or imagery reach the review queue looking finished.
 *
 * Plain strings rather than the SDK's enums, which would force a static import of
 * a package this module deliberately loads lazily. The values are the enums'.
 */
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
