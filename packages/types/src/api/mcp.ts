import { z } from "zod";
import {
  AiJobEntitySchema,
  AiJobStatusSchema,
  AiJobTypeSchema,
} from "./admin-ai.js";
import { IsoDateTimeSchema } from "./envelope.js";

/** `structuredContent` the MCP submit tools return (FR-AI-10). */
export const McpDraftSubmittedSchema = z
  .object({
    jobId: z.string(),
    status: AiJobStatusSchema,
    /** True when a retried call matched an earlier `clientRequestId` and nothing new was written. */
    isDuplicate: z.boolean(),
    reviewUrl: z.string(),
  })
  .strict();

export type McpDraftSubmitted = z.infer<typeof McpDraftSubmittedSchema>;

/** `get_draft_status` and each row of `list_my_drafts`. */
export const McpDraftStatusSchema = z
  .object({
    jobId: z.string(),
    type: AiJobTypeSchema,
    status: AiJobStatusSchema,
    /** The reviewer's reason when rejected — what the assistant needs to write the next attempt. */
    rejectionReason: z.string().nullable(),
    entities: z.array(AiJobEntitySchema),
    createdAt: IsoDateTimeSchema,
    reviewedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type McpDraftStatus = z.infer<typeof McpDraftStatusSchema>;

export const McpDraftListSchema = z
  .object({ drafts: z.array(McpDraftStatusSchema) })
  .strict();

export type McpDraftList = z.infer<typeof McpDraftListSchema>;

/**
 * The JSON-RPC envelope `POST /mcp` carries, for the API reference only: the MCP SDK validates the message
 * itself, and its shape is the Model Context Protocol's, not ours to restate.
 */
export const McpJsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string(),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const McpJsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).nullable(),
    result: z.unknown().optional(),
    error: z
      .object({ code: z.number(), message: z.string(), data: z.unknown() })
      .partial()
      .optional(),
  })
  .passthrough();
