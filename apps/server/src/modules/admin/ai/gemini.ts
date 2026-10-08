import type { CharacterSheet } from "@kidlearn/db";
import { env } from "../../../config/env.js";
import { CHILD_SAFETY_SETTINGS, getClient } from "./google-genai-client.js";

const STYLE_PREFIX =
  "Children's book illustration, soft rounded cartoon style, bright cheerful colors, " +
  "thick outlines, no text in image, friendly expressions, suitable for ages 3-6.";

export type CharacterSheetRef = Pick<CharacterSheet, "name" | "description">;

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

export async function generateIllustration(
  prompt: string,
  sheets: readonly CharacterSheetRef[] = [],
): Promise<Buffer> {
  const client = await getClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_IMAGE_MODEL,
    contents: buildIllustrationPrompt(prompt, sheets),
    config: { safetySettings: CHILD_SAFETY_SETTINGS },
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
