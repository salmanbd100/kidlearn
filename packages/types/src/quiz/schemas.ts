const QuizOptionSchema = z.object({
    id: z.string().min(1),
    text: LocalizedTextSchema.optional(),
    image: AssetRefSchema.optional(),
    audio: LocalizedAudioSchema.optional(),
});

export const McqQuestionSchema = z
    .object({
        schemaVersion: z.literal(1),
        type: z.literal("mcq"),
        prompt: LocalizedTextSchema,
        promptAudio: LocalizedAudioSchema,
        options: z.array(QuizOptionSchema).min(3).max(4),
        correctOptionId: z.string().min(1),
    })
    .superRefine((val, ctx) => {
        if (!val.options.some((o) => o.id === val.correctOptionId)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "correctOptionId not found in options" });
        }
        if (!val.options.every((o) => o.text || o.image)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "each option needs text or image" });
        }
    });
export type McqQuestion = z.infer<typeof McqQuestionSchema>;

export const QuizQuestionSchema = z.union([
    McqQuestionSchema, MatchPairQuestionSchema, DragAnswerQuestionSchema, PictureSelectQuestionSchema,
]);
export type QuizQuestionDefinition = z.infer<typeof QuizQuestionSchema>;