import type { CharacterSheet } from "@kidlearn/db";
import { env } from "../../lib/env.js";
import { getClient } from "./google-genai-client.js";

/**
 * Gemini image generation — story and lesson illustrations (file 36, FR-AI-05),
 * and the mechanism that keeps recurring characters recognisable (FR-AI-09).
 *
 * **The prompt is assembled here, not by the caller.** An image model is
 * stateless: it draws whatever this one prompt says and remembers nothing about
 * the picture it drew a second ago. So "the rabbit" on page 3 and "the rabbit" on
 * page 7 come back as two different rabbits unless every prompt carries the same
 * verbatim description of that rabbit — which is the whole of FR-AI-09, and why
 * `buildIllustrationPrompt` is exported and unit-tested separately from the call
 * that spends money.
 *
 * **The style prefix is first and always.** It is what makes two illustrations
 * drawn a month apart belong to the same product rather than to two different
 * ones, and putting it ahead of both the characters and the scene is deliberate:
 * the earliest instructions are the ones an image model weights most heavily.
 */

/**
 * The platform look, in the model's own vocabulary.
 *
 * `no text in image` earns its place: an image model asked for a classroom scene
 * will cheerfully render a blackboard covered in misspelled pseudo-English, which
 * for a 3–6 year old learning to read is worse than no picture. Every word a
 * child sees comes from `LessonTranslation` or `StoryPageTranslation`, so it can
 * be translated and narrated (FR-I18N-01).
 */
const STYLE_PREFIX =
  "Children's book illustration, soft rounded cartoon style, bright cheerful colors, " +
  "thick outlines, no text in image, friendly expressions, suitable for ages 3-6.";

/**
 * What the prompt builder needs from a sheet.
 *
 * `Pick` of the Prisma model rather than a fresh interface, so a rename in the
 * schema is a compile error here rather than a field this module quietly stops
 * reading — and so a test can pass two fields instead of a whole row.
 */
export type CharacterSheetRef = Pick<CharacterSheet, "name" | "description">;

/**
 * `STYLE_PREFIX`, then the characters, then the scene.
 *
 * The character block is worded as an instruction rather than as background
 * ("draw EXACTLY as described, identical in every image") because a description
 * offered as context gets treated as a suggestion, and a rabbit that is
 * *approximately* the same rabbit is what this exists to prevent.
 *
 * With no sheets the block is omitted entirely rather than left as an empty
 * heading: a prompt that says "Recurring characters:" and then nothing is a prompt
 * telling the model there are characters it has not been told about.
 */
export function buildIllustrationPrompt(
  prompt: string,
  sheets: readonly CharacterSheetRef[] = [],
): string {
  const characterBlock =
    sheets.length === 0
      ? ""
      : `Recurring characters (draw EXACTLY as described, identical in every image):\n${sheets
          .map((sheet) => `- ${sheet.name}: ${sheet.description}`)
          .join("\n")}\n`;

  return `${STYLE_PREFIX}\n${characterBlock}Scene: ${prompt}`;
}

/**
 * Draws one illustration and returns the image bytes.
 *
 * The model can answer with text instead of an image — a refusal, or a question
 * about the brief — and that arrives as a perfectly successful response with no
 * `inlineData` part. It is thrown as an error carrying whatever the model said,
 * because the alternative is a job that reports success and stores nothing, and
 * because the model's own words are the only diagnosis a reviewer gets
 * (FR-AI-08).
 */
export async function generateIllustration(
  prompt: string,
  sheets: readonly CharacterSheetRef[] = [],
): Promise<Buffer> {
  const client = await getClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_IMAGE_MODEL,
    contents: buildIllustrationPrompt(prompt, sheets),
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((part) => part.inlineData?.data !== undefined);

  if (!image?.inlineData?.data) {
    const said = parts
      .map((part) => part.text)
      .filter((text): text is string => typeof text === "string" && text !== "")
      .join(" ")
      .trim();
    throw new Error(
      `Gemini returned no image${said === "" ? "" : `: ${said}`}`,
    );
  }

  return Buffer.from(image.inlineData.data, "base64");
}
