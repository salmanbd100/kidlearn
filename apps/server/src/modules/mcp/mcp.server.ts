import type { Prisma } from "@kidlearn/db";
import { GradeLevelSchema, LocaleSchema } from "@kidlearn/types";
import { McpServer } from "@modelcontextprotocol/server";
import type { Logger } from "pino";
import { z } from "zod";
import { planQuestionFormats } from "../admin/ai/generate-questions.js";
import { prepareLesson } from "../admin/ai/generators/lesson.js";
import { prepareQuiz } from "../admin/ai/generators/quiz.js";
import {
  DEFAULT_PAGE_COUNT,
  prepareStory,
} from "../admin/ai/generators/story.js";
import { buildLessonUserPrompt } from "../admin/ai/prompts/lesson.js";
import { MCP_SERVER_INSTRUCTIONS } from "../admin/ai/prompts/mcp.js";
import { buildQuizUserPrompt } from "../admin/ai/prompts/quiz.js";
import { buildStoryUserPrompt } from "../admin/ai/prompts/story.js";
import type { McpPrincipal } from "./mcp.auth.js";
import { topicSubjectId } from "./mcp.service.js";
import { registerCurriculumTools } from "./tools/curriculum.js";
import { registerDraftTools } from "./tools/drafts.js";
import { registerMediaTools } from "./tools/media.js";
import { asPromptErrors, toPromptArgsSchema } from "./tools/schema.js";

export interface McpCaller {
  principal: McpPrincipal;
  /** What the client says it is. Shown to reviewers as self-reported; never used to decide anything. */
  client: Prisma.JsonObject | null;
  /** The request's logger, bound to the admin, so a failed tool call carries the request id and who made it. */
  log: Logger;
}

export const MCP_SERVER_INFO = { name: "kidlearn", version: "1.0.0" } as const;

/** One server per request (D3): it holds no state between calls, so the principal can be bound into every tool. */
export function buildMcpServer(caller: McpCaller): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: MCP_SERVER_INSTRUCTIONS,
  });

  registerCurriculumTools(server, caller);
  registerDraftTools(server, caller);
  registerMediaTools(server, caller);
  registerAuthoringPrompts(server, caller);

  return server;
}

// Prompt arguments are strings on the wire, so lists arrive comma-separated.
const LanguageListSchema = z
  .string()
  .transform((value) => value.split(",").map((one) => one.trim()))
  .pipe(z.array(LocaleSchema).min(1));

const WriteLessonPromptSchema = z.object({
  topicId: z.string().uuid(),
  gradeLevel: GradeLevelSchema,
  lessonFocus: z.string().min(3),
  languages: LanguageListSchema,
});

const WriteStoryPromptSchema = z.object({
  worldId: z.string().uuid(),
  gradeLevels: z
    .string()
    .transform((value) => value.split(",").map((one) => one.trim()))
    .pipe(z.array(GradeLevelSchema).min(1)),
  theme: z.string().min(3),
  languages: LanguageListSchema,
});

const WriteQuizPromptSchema = z.object({
  lessonId: z.string().uuid(),
  languages: LanguageListSchema,
});

// A convenience over the tools: every capability is also reachable through get_authoring_guide and the submit_* tools.
function registerAuthoringPrompts(server: McpServer, caller: McpCaller): void {
  server.registerPrompt(
    "write_lesson",
    {
      title: "Write a KidLearn lesson",
      description:
        "The brief KidLearn's own generator uses for a lesson, filled in for one topic. `languages` is comma-separated, e.g. en,bn.",
      argsSchema: toPromptArgsSchema(
        WriteLessonPromptSchema.extend({ languages: z.string() }),
      ),
    },
    async (args) =>
      asPromptErrors(caller, "write_lesson", async () => {
        const input = WriteLessonPromptSchema.parse(args);
        const subjectId = await topicSubjectId(input.topicId);
        const prepared = await prepareLesson({ ...input, subjectId });
        return userMessage(
          `${buildLessonUserPrompt({
            gradeLevel: input.gradeLevel,
            subjectName: prepared.subjectName,
            topicName: prepared.topicName,
            lessonFocus: input.lessonFocus,
            languages: input.languages,
          })}\n\nAlso write the quiz questions in the same submission. Submit with submit_lesson_draft (topicId ${prepared.topicId}, subjectId ${subjectId}).`,
        );
      }),
  );

  server.registerPrompt(
    "write_story",
    {
      title: "Write a KidLearn story",
      description:
        "The brief KidLearn's own generator uses for an illustrated story in one world. `gradeLevels` and `languages` are comma-separated.",
      argsSchema: toPromptArgsSchema(
        WriteStoryPromptSchema.extend({
          gradeLevels: z.string(),
          languages: z.string(),
        }),
      ),
    },
    async (args) =>
      asPromptErrors(caller, "write_story", async () => {
        const input = WriteStoryPromptSchema.parse(args);
        const prepared = await prepareStory(input);
        return userMessage(
          `${buildStoryUserPrompt({
            gradeLevels: input.gradeLevels,
            theme: input.theme,
            worldName: prepared.worldName,
            worldSlug: prepared.worldSlug,
            languages: input.languages,
            pageCount: DEFAULT_PAGE_COUNT,
          })}\n\nSubmit with submit_story_draft (worldId ${prepared.worldId}).`,
        );
      }),
  );

  server.registerPrompt(
    "write_quiz",
    {
      title: "Write quiz questions for a KidLearn lesson",
      description:
        "The brief KidLearn's own generator uses for one lesson's quiz. `languages` is comma-separated.",
      argsSchema: toPromptArgsSchema(
        WriteQuizPromptSchema.extend({ languages: z.string() }),
      ),
    },
    async (args) =>
      asPromptErrors(caller, "write_quiz", async () => {
        const input = WriteQuizPromptSchema.parse(args);
        const prepared = await prepareQuiz(input);
        const briefs = planQuestionFormats(prepared.count).map(
          (format, index) =>
            buildQuizUserPrompt({
              lessonTitle: prepared.lessonTitle,
              gradeLevels: prepared.gradeLevels,
              lessonContext: prepared.lessonContext,
              languages: input.languages,
              format,
              position: index + 1,
              total: prepared.count,
            }),
        );
        return userMessage(
          `${briefs.join("\n\n---\n\n")}\n\nSubmit all ${prepared.count} together with submit_quiz_questions (lessonId ${prepared.lessonId}).`,
        );
      }),
  );
}

function userMessage(text: string) {
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text } },
    ],
  };
}
