import { z } from "zod";

export const LocaleSchema = z.enum(["en", "bn"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const LocalizedTextSchema = z.record(LocaleSchema, z.string().min(1));
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const AssetRefSchema = z.object({
    kind: z.enum(["image", "audio", "video"]),
    url: z.string().url(),
    alt: LocalizedTextSchema.optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const LocalizedAudioSchema = z.record(
    LocaleSchema,
    AssetRefSchema.extend({ kind: z.literal("audio") }),
);
export type LocalizedAudio = z.infer<typeof LocalizedAudioSchema>;