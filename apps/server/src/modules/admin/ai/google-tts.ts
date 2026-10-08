import type { Locale } from "@kidlearn/types";
import { env } from "../../../config/env.js";
import { PROVIDER_TIMEOUT_MS } from "./google-genai-client.js";

// The voice name carries its language, so languageCode is derived from it, not configured.
const VOICE_BY_LOCALE: Record<Locale, { languageCode: string; name: string }> =
  {
    en: languageOf(env.GOOGLE_TTS_VOICE_EN),
    bn: languageOf(env.GOOGLE_TTS_VOICE_BN),
  };

function languageOf(name: string): { languageCode: string; name: string } {
  // `en-US-Standard-C` -> `en-US`; ttsVoice() in config/env.ts refuses to boot on any other shape.
  return { languageCode: name.split("-").slice(0, 2).join("-"), name };
}

export async function generateNarration(
  text: string,
  locale: Locale,
): Promise<Buffer> {
  const voice = VOICE_BY_LOCALE[locale];

  const response = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      // Key in a header, not the query string, so it never lands in a proxy log, APM trace or error quoting the URL.
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GOOGLE_TTS_API_KEY,
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.languageCode, name: voice.name },
        // mp3, not the default LINEAR16: the smallest format, and every browser plays it.
        audioConfig: { audioEncoding: "MP3" },
      }),
    },
  );

  if (!response.ok) {
    // The provider's body verbatim: it names the actual fault, and the job record keeps whatever is thrown here.
    throw new Error(
      `Google TTS ${response.status}: ${await response.text()}`.trim(),
    );
  }

  // `text:synthesize` returns base64 audio in a JSON envelope. The cast is at that external boundary and
  // asserts nothing: the one field it names is checked below.
  const { audioContent } = (await response.json()) as {
    audioContent?: string;
  };

  if (audioContent === undefined || audioContent === "") {
    throw new Error("Google TTS returned no audio content");
  }

  return Buffer.from(audioContent, "base64");
}
