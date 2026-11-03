import {
  type QuizQuestionType,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import type { McpServer } from "@modelcontextprotocol/server";
import { buildAuthoringGuide } from "../../admin/ai/prompts/mcp.js";
import { QUIZ_QUESTION_JSON_SCHEMAS } from "../../admin/ai/prompts/quiz.js";
import {
  LessonIdArgsSchema,
  ListCharactersArgsSchema,
  ListCurriculumArgsSchema,
  QuizFormatArgsSchema,
} from "../mcp.schema.js";
import type { McpCaller } from "../mcp.server.js";
import {
  listCharacterSheets,
  listCurriculum,
  readLessonForAuthoring,
} from "../mcp.service.js";
import {
  asToolErrors,
  parseArgs,
  toolResult,
  toToolInputSchema,
} from "./schema.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// Fixtures the payload contract's own tests parse, so an example can never be one the schema rejects.
const QUIZ_FORMAT_EXAMPLES: Record<QuizQuestionType, unknown> = {
  mcq: validMcq,
  match_pair: validMatchPair,
  drag_answer: validDragAnswer,
  picture_select: validPictureSelect,
};

/** Curriculum, worlds and characters only: no tool here reads a parent, a child or their progress (Req. 9). */
export function registerCurriculumTools(
  server: McpServer,
  caller: McpCaller,
): void {
  server.registerTool(
    "get_authoring_guide",
    {
      title: "Read KidLearn's authoring rules",
      description:
        "The rules every lesson, story and quiz must follow, the grade levels and languages, and how to use the other tools. Call this before writing anything.",
      annotations: READ_ONLY,
    },
    async () => ({
      content: [{ type: "text", text: buildAuthoringGuide() }],
    }),
  );

  server.registerTool(
    "list_curriculum",
    {
      title: "List subjects, topics and worlds",
      description:
        "Subjects with their topics (ids, names, grade levels, how many lessons each has) and the worlds a lesson or story can be set in. Every status is listed, because a draft topic is still a place to write a lesson.",
      inputSchema: toToolInputSchema(ListCurriculumArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) =>
      asToolErrors(caller, "list_curriculum", async () => {
        const parsed = parseArgs(ListCurriculumArgsSchema, args);
        if (!parsed.ok) return parsed.result;
        return toolResult({
          ...(await listCurriculum(parsed.value.subjectId)),
        });
      }),
  );

  server.registerTool(
    "get_lesson",
    {
      title: "Read one lesson",
      description:
        "A lesson's title and spoken intro in each language, its grade levels, what it taught (the narration, when it was AI-written), its quiz's status and the questions it already has. Read it before writing quiz questions for it.",
      inputSchema: toToolInputSchema(LessonIdArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) =>
      asToolErrors(caller, "get_lesson", async () => {
        const parsed = parseArgs(LessonIdArgsSchema, args);
        if (!parsed.ok) return parsed.result;
        return toolResult({
          ...(await readLessonForAuthoring(parsed.value.lessonId)),
        });
      }),
  );

  server.registerTool(
    "list_characters",
    {
      title: "List character sheets",
      description:
        "The stable visual descriptions of recurring characters (FR-AI-09), optionally for one world. Reuse one in a story so the illustrations stay consistent.",
      inputSchema: toToolInputSchema(ListCharactersArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) =>
      asToolErrors(caller, "list_characters", async () => {
        const parsed = parseArgs(ListCharactersArgsSchema, args);
        if (!parsed.ok) return parsed.result;
        return toolResult({
          characters: await listCharacterSheets(parsed.value.worldId),
        });
      }),
  );

  server.registerTool(
    "get_quiz_format_schema",
    {
      title: "Get one quiz format's schema",
      description:
        "The exact JSON Schema one quiz question format must satisfy, and one valid example. Fetch it for each format you use.",
      inputSchema: toToolInputSchema(QuizFormatArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) => {
      const parsed = parseArgs(QuizFormatArgsSchema, args);
      if (!parsed.ok) return parsed.result;
      const { format } = parsed.value;

      return toolResult({
        format,
        // The same string the Gemini quiz prompt embeds, so the two paths are held to one shape.
        schema: JSON.parse(QUIZ_QUESTION_JSON_SCHEMAS[format]),
        example: QUIZ_FORMAT_EXAMPLES[format],
      });
    },
  );
}
