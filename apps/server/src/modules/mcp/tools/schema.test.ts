import { describe, expect, it } from "vitest";
import {
  SubmitLessonToolSchema,
  SubmitQuizToolSchema,
  SubmitStoryToolSchema,
} from "../mcp.schema.js";
import { toToolInputSchema } from "./schema.js";

function jsonOf(schema: Parameters<typeof toToolInputSchema>[0]) {
  // The standard-schema JSON accessor is typed as an opaque record union; these schemas are all objects.
  return toToolInputSchema(schema)["~standard"].jsonSchema.input({
    target: "draft-2020-12",
  }) as Record<string, unknown>;
}

describe("toToolInputSchema", () => {
  it.each([
    ["submit_lesson_draft", SubmitLessonToolSchema, "lesson"],
    ["submit_story_draft", SubmitStoryToolSchema, "story"],
    ["submit_quiz_questions", SubmitQuizToolSchema, "questions"],
  ])(
    "advertises %s as a plain object schema with no $ref",
    (_name, schema, content) => {
      const json = jsonOf(schema);

      expect(json.type).toBe("object");
      expect(json).not.toHaveProperty("$schema");
      expect(JSON.stringify(json)).not.toContain("$ref");
      expect(json.properties).toHaveProperty(content);
      expect(json.required).toContain(content);
    },
  );

  it("keeps the quiz question loose, so no client has to accept the full union (D6)", () => {
    const serialised = JSON.stringify(jsonOf(SubmitQuizToolSchema));

    expect(serialised).not.toContain("anyOf");
    expect(serialised.length).toBeLessThan(3000);
  });
});
