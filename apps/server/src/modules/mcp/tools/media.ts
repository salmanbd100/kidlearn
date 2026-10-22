import type { AIJobType, Prisma } from "@kidlearn/db";
import type { BatchGenerationRef, NarrationEntity } from "@kidlearn/types";
import type { McpServer } from "@modelcontextprotocol/server";
import { env, isGeminiConfigured } from "../../../config/env.js";
import { generateIllustrationBatch } from "../../admin/ai/generators/illustration.js";
import { generateNarrationBatch } from "../../admin/ai/generators/narration.js";
import { asRecord, readString } from "../../admin/ai/review/job.js";
import { JobIdArgsSchema, StoryIdArgsSchema } from "../mcp.schema.js";
import type { McpCaller } from "../mcp.server.js";
import { assertOwnStoryDraft, readOwnDraftOutput } from "../mcp.service.js";
import {
  asToolErrors,
  parseArgs,
  toolError,
  toolResult,
  toToolInputSchema,
} from "./schema.js";

// Starts provider calls that cost money and adds clips to the queue; asking twice records only what is still missing.
const STARTS_GENERATION = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Audio and pictures stay server-side (D7): a chat client cannot produce TTS, and image bytes do not fit the transport. */
export function registerMediaTools(server: McpServer, caller: McpCaller): void {
  server.registerTool(
    "request_narration",
    {
      title: "Record narration for one of your drafts",
      description:
        "Records the spoken narration a draft is missing, in every language it has text for, with KidLearn's own text-to-speech. Each clip lands in the AI Queue for review like the draft itself. Counts against the daily audio budget.",
      inputSchema: toToolInputSchema(JobIdArgsSchema),
      annotations: STARTS_GENERATION,
    },
    async (args) =>
      asToolErrors(caller, "request_narration", async () => {
        const parsed = parseArgs(JobIdArgsSchema, args);
        if (!parsed.ok) return parsed.result;

        const job = await readOwnDraftOutput(
          caller.principal.adminId,
          parsed.value.jobId,
        );

        const targets = narrationTargets(job.type, asRecord(job.rawOutput));
        if (targets.length === 0) {
          return toolError("That draft created nothing that can be narrated.");
        }

        const requester = { requestedById: caller.principal.adminId };
        const total: BatchGenerationRef = { jobIds: [], skipped: 0, failed: 0 };
        for (const target of targets) {
          const batch = await generateNarrationBatch(target, requester);
          total.jobIds.push(...batch.jobIds);
          total.skipped += batch.skipped;
          total.failed += batch.failed;
        }
        return toolResult(
          { ...total },
          `${total.jobIds.length} narration clip(s) started, ${total.skipped} already had audio, ${total.failed} failed. Each clip is reviewed in the AI Queue.`,
        );
      }),
  );

  server.registerTool(
    "request_illustrations",
    {
      title: "Draw the pictures for a story",
      description:
        "Draws every page of one of your story drafts that has an illustration brief and no picture yet, using KidLearn's own image model and the world's character sheets. Only stories you submitted over MCP and that are not yet published. Each picture is reviewed in the AI Queue. Counts against the daily image budget.",
      inputSchema: toToolInputSchema(StoryIdArgsSchema),
      annotations: STARTS_GENERATION,
    },
    async (args) =>
      asToolErrors(caller, "request_illustrations", async () => {
        const parsed = parseArgs(StoryIdArgsSchema, args);
        if (!parsed.ok) return parsed.result;

        if (!isGeminiConfigured(env)) {
          return toolError(
            "No image model is configured on this KidLearn server, so pictures are uploaded by hand in the CMS media library.",
          );
        }

        await assertOwnStoryDraft(
          caller.principal.adminId,
          parsed.value.storyId,
        );
        const batch = await generateIllustrationBatch(parsed.value, {
          requestedById: caller.principal.adminId,
        });
        return toolResult(
          { ...batch },
          `${batch.jobIds.length} illustration(s) started, ${batch.skipped} page(s) skipped, ${batch.failed} failed. Each picture is reviewed in the AI Queue.`,
        );
      }),
  );
}

// `entities` is what `persist*` returned. A quiz job also names its lesson, whose intro it did not write.
function narrationTargets(
  type: AIJobType,
  rawOutput: Record<string, unknown>,
): Array<{ entity: NarrationEntity; id: string }> {
  // JSONB boundary: `asRecord` re-checks the shape.
  const entities = asRecord((rawOutput.entities ?? null) as Prisma.JsonValue);
  const lessonId = readString(entities, "lessonId");
  const storyId = readString(entities, "storyId");
  const quizId = readString(entities, "quizId");

  const targets: Array<{ entity: NarrationEntity; id: string }> = [];
  if (type === "lesson" && lessonId !== undefined) {
    targets.push({ entity: "lesson", id: lessonId });
  }
  if (type === "story" && storyId !== undefined) {
    targets.push({ entity: "story", id: storyId });
  }
  if ((type === "lesson" || type === "quiz") && quizId !== undefined) {
    targets.push({ entity: "quiz", id: quizId });
  }
  return targets;
}
