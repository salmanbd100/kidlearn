import type { GoogleGenAI } from "@google/genai";
import { env } from "../../lib/env.js";

/**
 * The one `@google/genai` client, shared by the text generators (file 37a) and
 * the illustration model (file 36) — one key, two models, one construction.
 *
 * **The SDK is loaded on first use, not at import.**
 *
 * `@google/genai` pulls in protobufjs and the whole Google auth stack, which is
 * over ten seconds of module evaluation. Every other client in this codebase is
 * constructed at import time, and this one deliberately is not: it would put that
 * cost on the boot path of an API that sleeps on its free tier and is measured on
 * how fast it wakes (NFR-PERF-04), in order to be ready for an endpoint only an
 * administrator ever calls.
 *
 * Memoised, so the second illustration in a batch does not re-resolve it. `import`
 * caches the module either way; this caches the client on top.
 *
 * A *rejection* is deliberately not memoised. `??=` only reassigns on `undefined`,
 * so caching a rejected promise would make one transient module-evaluation failure
 * — protobufjs running out of memory on the free-tier instance this laziness
 * exists for — permanent: every later generation would fail with the same stale
 * error, burning the daily cap, until somebody restarted the process.
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
