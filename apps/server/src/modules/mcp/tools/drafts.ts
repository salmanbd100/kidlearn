import type { AIJobType } from "@kidlearn/db";
import type { McpDraftSubmitted } from "@kidlearn/types";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { env } from "../../../config/env.js";
import {
  persistLesson,
  prepareLesson,
} from "../../admin/ai/generators/lesson.js";
import {
  persistQuiz,
  prepareQuiz,
  QuizPublishedDuringWriteError,
  quizPublishedConflict,
} from "../../admin/ai/generators/quiz.js";
import { persistStory, prepareStory } from "../../admin/ai/generators/story.js";
import {
  SUBMIT_LESSON_DESCRIPTION,
  SUBMIT_QUIZ_DESCRIPTION,
  SUBMIT_STORY_DESCRIPTION,
} from "../../admin/ai/prompts/mcp.js";
import {
  findSubmittedDraft,
  recordSubmittedDraft,
  type SubmittedDraftResult,
} from "../../admin/ai/record-submitted-draft.js";
import {
  buildRetryFeedback,
  flatten,
} from "../../admin/ai/run-generation-job.js";
import { buildLessonGenerationOutputSchema } from "../../admin/ai/schemas/lesson.js";
import {
  buildQuizGenerationOutputSchema,
  QUIZ_COUNT_BOUNDS,
} from "../../admin/ai/schemas/quiz.js";
import {
  buildStoryGenerationOutputSchema,
  STORY_PAGE_BOUNDS,
} from "../../admin/ai/schemas/story.js";
import {
  JobIdArgsSchema,
  ListMyDraftsArgsSchema,
  SubmitLessonArgsSchema,
  SubmitLessonToolSchema,
  SubmitQuizArgsSchema,
  SubmitQuizToolSchema,
  SubmitStoryArgsSchema,
  SubmitStoryToolSchema,
} from "../mcp.schema.js";
import type { McpCaller } from "../mcp.server.js";
import { listOwnDrafts, readOwnDraft } from "../mcp.service.js";
import {
  asToolErrors,
  parseArgs,
  toolError,
  toolResult,
  toToolInputSchema,
} from "./schema.js";

// Creates a draft and nothing else. Not `idempotentHint`: `clientRequestId` is optional, and a client that retries a
// call sent without one on the strength of the hint would write a second draft.
const WRITES_DRAFT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function reviewUrl(jobId: string): string {
  return `${env.WEB_ORIGIN.replace(/\/+$/, "")}/admin/ai-queue/${jobId}`;
}

export function registerDraftTools(server: McpServer, caller: McpCaller): void {
  server.registerTool(
    "submit_lesson_draft",
    {
      title: "Submit a lesson for review",
      description: SUBMIT_LESSON_DESCRIPTION,
      inputSchema: toToolInputSchema(SubmitLessonToolSchema),
      annotations: WRITES_DRAFT,
    },
    async (args) =>
      asToolErrors(caller, "submit_lesson_draft", async () => {
        const tool = "submit_lesson_draft";
        const parsed = parseArgs(SubmitLessonArgsSchema, args);
        if (!parsed.ok) return rejected(caller, tool, 1, parsed.result);
        const { lesson, clientRequestId, ...request } = parsed.value;

        const earlier = await earlierSubmission(
          caller,
          "lesson",
          clientRequestId,
        );
        if (earlier !== undefined) return submitted("lesson", earlier);

        const prepared = await prepareLesson(request);
        const content = validateContent(
          caller,
          tool,
          buildLessonGenerationOutputSchema(request.languages),
          lesson,
        );
        if (!content.ok) return content.result;

        const result = await recordSubmittedDraft({
          type: "lesson",
          input: prepared.jobInput,
          submitted: lesson,
          parsed: content.value,
          ...submitter(caller, clientRequestId),
          persist: (value, jobId, tx) =>
            persistLesson({
              input: request,
              parsed: value,
              jobId,
              tx,
              topicId: prepared.topicId,
              worldId: prepared.worldId,
            }),
        });
        return submitted("lesson", result);
      }),
  );

  server.registerTool(
    "submit_story_draft",
    {
      title: "Submit a story for review",
      description: SUBMIT_STORY_DESCRIPTION,
      inputSchema: toToolInputSchema(SubmitStoryToolSchema),
      annotations: WRITES_DRAFT,
    },
    async (args) =>
      asToolErrors(caller, "submit_story_draft", async () => {
        const tool = "submit_story_draft";
        const parsed = parseArgs(SubmitStoryArgsSchema, args);
        if (!parsed.ok) return rejected(caller, tool, 1, parsed.result);
        const { story, clientRequestId, ...request } = parsed.value;

        const earlier = await earlierSubmission(
          caller,
          "story",
          clientRequestId,
        );
        if (earlier !== undefined) return submitted("story", earlier);

        const pageCount = countOf(story, "pages");
        if (
          pageCount < STORY_PAGE_BOUNDS.min ||
          pageCount > STORY_PAGE_BOUNDS.max
        ) {
          return rejected(
            caller,
            tool,
            1,
            toolError(
              `story.pages: a story has ${STORY_PAGE_BOUNDS.min} to ${STORY_PAGE_BOUNDS.max} pages; this one has ${pageCount}.`,
            ),
          );
        }

        const input = { ...request, pageCount };
        const prepared = await prepareStory(input);
        const content = validateContent(
          caller,
          tool,
          buildStoryGenerationOutputSchema({
            languages: request.languages,
            pageCount,
          }),
          story,
        );
        if (!content.ok) return content.result;

        const result = await recordSubmittedDraft({
          type: "story",
          input: prepared.jobInput,
          submitted: story,
          parsed: content.value,
          ...submitter(caller, clientRequestId),
          persist: (value, jobId, tx) =>
            persistStory({
              input,
              parsed: value,
              jobId,
              tx,
              worldId: prepared.worldId,
            }),
        });
        return submitted("story", result);
      }),
  );

  server.registerTool(
    "submit_quiz_questions",
    {
      title: "Submit quiz questions for review",
      description: SUBMIT_QUIZ_DESCRIPTION,
      inputSchema: toToolInputSchema(SubmitQuizToolSchema),
      annotations: WRITES_DRAFT,
    },
    async (args) =>
      asToolErrors(caller, "submit_quiz_questions", async () => {
        const tool = "submit_quiz_questions";
        const parsed = parseArgs(SubmitQuizArgsSchema, args);
        if (!parsed.ok) return rejected(caller, tool, 1, parsed.result);
        const { questions, clientRequestId, ...request } = parsed.value;

        const earlier = await earlierSubmission(
          caller,
          "quiz",
          clientRequestId,
        );
        if (earlier !== undefined) return submitted("quiz", earlier);

        const count = Array.isArray(questions) ? questions.length : 0;
        if (count < QUIZ_COUNT_BOUNDS.min || count > QUIZ_COUNT_BOUNDS.max) {
          return rejected(
            caller,
            tool,
            1,
            toolError(
              `questions: submit ${QUIZ_COUNT_BOUNDS.min} to ${QUIZ_COUNT_BOUNDS.max} questions; this has ${count}.`,
            ),
          );
        }

        const prepared = await prepareQuiz({ ...request, count });
        const content = validateContent(
          caller,
          tool,
          buildQuizGenerationOutputSchema(count),
          { questions },
        );
        if (!content.ok) return content.result;

        try {
          const result = await recordSubmittedDraft({
            type: "quiz",
            input: prepared.jobInput,
            submitted: { questions },
            parsed: content.value,
            ...submitter(caller, clientRequestId),
            persist: (value, jobId, tx) =>
              persistQuiz({ prepared, parsed: value, jobId, tx }),
          });
          return submitted("quiz", result);
        } catch (error) {
          // Nothing was billed and the transaction rolled back whole, so this is the same refusal as before the write.
          if (error instanceof QuizPublishedDuringWriteError) {
            throw quizPublishedConflict();
          }
          throw error;
        }
      }),
  );

  server.registerTool(
    "get_draft_status",
    {
      title: "Check one of your drafts",
      description:
        "Where one of your drafts has got to: awaiting review, approved or rejected. A rejected draft carries the reviewer's reason — read it before writing the next attempt.",
      inputSchema: toToolInputSchema(JobIdArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) =>
      asToolErrors(caller, "get_draft_status", async () => {
        const parsed = parseArgs(JobIdArgsSchema, args);
        if (!parsed.ok) return parsed.result;
        return toolResult({
          ...(await readOwnDraft(caller.principal.adminId, parsed.value.jobId)),
        });
      }),
  );

  server.registerTool(
    "list_my_drafts",
    {
      title: "List your drafts",
      description:
        "The drafts you have submitted over MCP, newest first, optionally filtered by status. Check it before writing more, so you do not queue the same lesson twice.",
      inputSchema: toToolInputSchema(ListMyDraftsArgsSchema),
      annotations: READ_ONLY,
    },
    async (args) =>
      asToolErrors(caller, "list_my_drafts", async () => {
        const parsed = parseArgs(ListMyDraftsArgsSchema, args);
        if (!parsed.ok) return parsed.result;
        const drafts = await listOwnDrafts(caller.principal.adminId, {
          limit: parsed.value.limit,
          ...(parsed.value.status === undefined
            ? {}
            : { status: parsed.value.status }),
        });
        return toolResult({ drafts });
      }),
  );
}

/**
 * Checked before anything else, so a retry whose first attempt committed is answered with that job even if the
 * lesson's quiz has been published, or its topic moved, since — the state a re-validation would trip on.
 */
function earlierSubmission(
  caller: McpCaller,
  type: AIJobType,
  clientRequestId: string | undefined,
): Promise<SubmittedDraftResult | undefined> {
  return findSubmittedDraft({
    type,
    requestedById: caller.principal.adminId,
    ...(clientRequestId === undefined ? {} : { clientRequestId }),
  });
}

function submitter(caller: McpCaller, clientRequestId: string | undefined) {
  return {
    requestedById: caller.principal.adminId,
    client: caller.client,
    ...(clientRequestId === undefined ? {} : { clientRequestId }),
  };
}

// Invalid submissions are not persisted; the log keeps abuse visible without the payload (Req. 9).
function rejected(
  caller: McpCaller,
  tool: string,
  issueCount: number,
  result: CallToolResult,
): CallToolResult {
  caller.log.info({ tool, issueCount }, "mcp submission failed validation");
  return result;
}

function validateContent<T>(
  caller: McpCaller,
  tool: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  content: unknown,
): { ok: true; value: T } | { ok: false; result: CallToolResult } {
  const parsed = schema.safeParse(content);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    // The same feedback the Gemini retry sends, so both paths teach a model the same way.
    result: rejected(
      caller,
      tool,
      parsed.error.issues.length,
      toolError(buildRetryFeedback(flatten(parsed.error))),
    ),
  };
}

function submitted(
  type: AIJobType,
  result: SubmittedDraftResult,
): CallToolResult {
  const url = reviewUrl(result.jobId);
  const content: McpDraftSubmitted = {
    jobId: result.jobId,
    status: result.status,
    isDuplicate: result.isDuplicate,
    reviewUrl: url,
  };
  const summary = result.isDuplicate
    ? `This clientRequestId was already used; nothing new was written. The existing ${type} draft is ${result.status}: ${url}`
    : `The ${type} draft is waiting for a person to review it in the AI Queue: ${url}`;
  return toolResult({ ...content }, summary);
}

function countOf(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) return 0;
  // Tool arguments are parsed JSON; only the array length is read, the full parse comes after.
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field.length : 0;
}
