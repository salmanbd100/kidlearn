import type { Locale } from "@kidlearn/types";
import { env } from "../../lib/env.js";

/**
 * Google Cloud Text-to-Speech — the narration voice (file 36, FR-AI-04,
 * FR-I18N-05; provider swapped in file 37a).
 */

/**
 * The voice name carries its own language, so `languageCode` is derived from it
 * rather than configured beside it.
 */
const VOICE_BY_LOCALE: Record<Locale, { languageCode: string; name: string }> =
  {
    en: languageOf(env.GOOGLE_TTS_VOICE_EN),
    bn: languageOf(env.GOOGLE_TTS_VOICE_BN),
  };

function languageOf(name: string): { languageCode: string; name: string } {
  // `en-US-Standard-C` → `en-US`. The shape is guaranteed by `ttsVoice()` in
  // `lib/env.ts`, which refuses to boot on anything else.
  return { languageCode: name.split("-").slice(0, 2).join("-"), name };
}

export async function generateNarration(
  text: string,
  locale: Locale,
): Promise<Buffer> {
  const voice = VOICE_BY_LOCALE[locale];

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.languageCode, name: voice.name },
        // mp3 rather than the default LINEAR16: it is what every browser plays
        // and the smallest of the offered formats, and the audience is on phones.
        audioConfig: { audioEncoding: "MP3" },
      }),
    },
  );

  if (!response.ok) {
    // The provider's own body, verbatim. It names the actual fault — an unknown
    // voice name, an exhausted quota, a key restricted to another API — and the
    // job record keeps whatever is thrown here, so summarising it would throw
    // away the only diagnosis a reviewer gets (FR-AI-08).
    throw new Error(
      `Google TTS ${response.status}: ${await response.text()}`.trim(),
    );
  }

  // `text:synthesize` answers with base64 audio inside a JSON envelope rather
  // than raw bytes, which is the one shape difference from the provider this
  // replaced — and the reason it stays inside this file is that
  // `generators/narration.ts` never has to know. The cast is at that external
  // boundary and asserts nothing: the one field it names is checked below.
  const { audioContent } = (await response.json()) as {
    audioContent?: string;
  };

  if (audioContent === undefined || audioContent === "") {
    throw new Error("Google TTS returned no audio content");
  }

  return Buffer.from(audioContent, "base64");
}
