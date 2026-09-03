import type { Locale } from "@kidlearn/types";
import { env } from "../../lib/env.js";

/**
 * ElevenLabs text-to-speech — the narration voice (file 36, FR-AI-04, FR-I18N-05).
 *
 * **Plain `fetch`, no SDK.** The whole integration is one POST that answers with
 * mp3 bytes; a client library would add a dependency, a type surface and an error
 * vocabulary to learn in exchange for nothing this needs.
 *
 * **One voice per locale, and the voice is the locale's.** `eleven_multilingual_v2`
 * will read Bangla text in any voice, including one with a heavy English accent,
 * so which voice speaks which language is a decision that has to be made once and
 * held — it is not something a caller passes in. The ids come from the
 * environment (`.env.example` documents how an admin picks them) because they are
 * account-specific, and a wrong one produces *audible* damage rather than an
 * error: the clip generates, uploads, and passes a review that was not listening
 * in that language.
 *
 * The bytes are returned rather than uploaded here. Where the clip lands is
 * `services/mediaService.ts`'s business, and keeping the two apart is what lets
 * the narration generator's test drive a real upload path against a stubbed voice.
 */

const VOICE_BY_LOCALE: Record<Locale, string> = {
  en: env.ELEVENLABS_VOICE_ID_EN,
  bn: env.ELEVENLABS_VOICE_ID_BN,
};

/**
 * The multilingual model, because the platform is bilingual and a
 * monolingual-English model cannot read Bangla at all.
 */
const MODEL_ID = "eleven_multilingual_v2";

/**
 * Calm and consistent rather than expressive.
 *
 * High `stability` suppresses the take-to-take variation the model adds for
 * drama: a story read to a four-year-old should sound the same on page 7 as on
 * page 1, and a lesson intro that lands differently each time it is regenerated
 * is a lesson that sounds broken. High `similarity_boost` keeps it recognisably
 * the chosen voice, which is the audio half of the consistency `CharacterSheet`
 * buys for pictures (FR-AI-09).
 */
const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8 } as const;

export async function generateNarration(
  text: string,
  locale: Locale,
): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_BY_LOCALE[locale]}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        // mp3 rather than the default: it is what every browser plays and the
        // smallest of the offered formats, and the audience is on phones.
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!response.ok) {
    // The provider's own body, verbatim. It names the actual fault — an unknown
    // voice id, an exhausted character quota, a rejected key — and the job record
    // keeps whatever is thrown here, so summarising it would throw away the only
    // diagnosis a reviewer gets (FR-AI-08).
    throw new Error(
      `ElevenLabs ${response.status}: ${await response.text()}`.trim(),
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
