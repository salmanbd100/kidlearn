export function parseActivityDefinition(json: unknown): ActivityDefinition {
    return ActivityDefinitionSchema.parse(json);
}
export function safeParseActivityDefinition(json: unknown) {
    return ActivityDefinitionSchema.safeParse(json);
}
