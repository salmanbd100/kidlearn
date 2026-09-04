import type { GoogleGenAI } from "@google/genai";
import { env } from "../../lib/env.js";

/**
 * The one `@google/genai` client, shared by the text generators (file 37a) and
 * the illustration model (file 36) — one key, two models, one construction.
 */
let clientPromise: Promise<GoogleGenAI> | undefined;

export function getClient(): Promise<GoogleGenAI> {
  clientPromise ??= import("@google/genai")
    .then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }))
    .catch((error: unknown) => {
      clientPromise = undefined;
      throw error;
    });
  return clientPromise;
}
