import type { CharacterSheet } from "@kidlearn/db";
import { env } from "../../lib/env.js";
import { getClient } from "./google-genai-client.js";

/**
 * Gemini image generation — story and lesson illustrations (file 36, FR-AI-05),
 * and the mechanism that keeps recurring characters recognisable (FR-AI-09).
 */

/** The platform look, in the model's own vocabulary. */
const STYLE_PREFIX =
  "Children's book illustration, soft rounded cartoon style, bright cheerful colors, " +
  "thick outlines, no text in image, friendly expressions, suitable for ages 3-6.";

/** What the prompt builder needs from a sheet. */
export type CharacterSheetRef = Pick<CharacterSheet, "name" | "description">;

/** `STYLE_PREFIX`, then the characters, then the scene. */
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

/** Draws one illustration and returns the image bytes. */
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
