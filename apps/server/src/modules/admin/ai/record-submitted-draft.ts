import { type AIJobStatus, type AIJobType, Prisma } from "@kidlearn/db";
import { prisma } from "../../../config/prisma.js";
import { ApiError } from "../../../shared/errors/errors.js";
import { withSerializationRetry } from "../../../shared/utils/serializable-retry.js";
import { assertWithinMcpDraftCap } from "./rate-guard.js";
import { toJson } from "./run-generation-job.js";

export interface SubmittedDraftResult {
  jobId: string;
  /** `awaiting_review` when written; a duplicate reports where the first one has got to since. */
  status: AIJobStatus;
  /** True when `clientRequestId` matched an earlier submission and nothing new was written. */
  isDuplicate: boolean;
}

export interface RecordSubmittedDraftOptions<TParsed> {
  type: AIJobType;
  /** The tool arguments minus the content, plus the names `prepare*` resolved. */
  input: Prisma.JsonObject;
  /** What the client sent, verbatim, for the audit record. */
  submitted: unknown;
  parsed: TParsed;
  requestedById: string;
  client: Prisma.JsonObject | null;
  clientRequestId?: string;
  persist: (
    parsed: TParsed,
    jobId: string,
    tx: Prisma.TransactionClient,
  ) => Promise<Prisma.JsonObject>;
}

/**
 * The MCP counterpart of `runGenerationJob`. The model already ran on the client, so there is no
 * `pending`/`generating` state: the job row and the content rows are written together or not at all.
 */
export async function recordSubmittedDraft<TParsed>(
  options: RecordSubmittedDraftOptions<TParsed>,
): Promise<SubmittedDraftResult> {
  try {
    return await withSerializationRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const existing = await findSubmittedDraft(options, tx);
          if (existing !== undefined) return existing;

          // In the transaction, so concurrent submissions cannot all read the count before any row exists.
          await assertWithinMcpDraftCap(options.requestedById, tx);

          const job = await tx.aIGenerationJob.create({
            data: {
              type: options.type,
              source: "mcp",
              status: "awaiting_review",
              input: options.input,
              requestedById: options.requestedById,
              client: options.client ?? Prisma.JsonNull,
              ...(options.clientRequestId === undefined
                ? {}
                : { clientRequestId: options.clientRequestId }),
            },
            select: { id: true },
          });

          const entities = await options.persist(options.parsed, job.id, tx);

          await tx.aIGenerationJob.update({
            where: { id: job.id },
            data: {
              // `parsed` beside `submitted`: readers shared with the Gemini path (`readParsedLesson`,
              // `readCharacterDescriptions`) read the validated content from there.
              rawOutput: {
                submitted: toJson(options.submitted),
                parsed: toJson(options.parsed),
                entities,
              },
            },
          });

          return {
            jobId: job.id,
            status: "awaiting_review",
            isDuplicate: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    // Two retries of one call raced past `findExisting`; the loser's transaction rolled back whole, so the winner's row is the answer.
    if (isClientRequestCollision(error)) {
      const existing = await findSubmittedDraft(options);
      if (existing !== undefined) return existing;
    }
    throw error;
  }
}

/**
 * The earlier job a repeated `clientRequestId` names, or `undefined`. One id reused for a different kind of content
 * is refused: answering a quiz submission with the lesson job it collided with would report questions nobody wrote.
 */
export async function findSubmittedDraft(
  options: Pick<
    RecordSubmittedDraftOptions<unknown>,
    "type" | "requestedById" | "clientRequestId"
  >,
  client: Pick<Prisma.TransactionClient, "aIGenerationJob"> = prisma,
): Promise<SubmittedDraftResult | undefined> {
  if (options.clientRequestId === undefined) return undefined;

  const job = await client.aIGenerationJob.findUnique({
    where: {
      requestedById_clientRequestId: {
        requestedById: options.requestedById,
        clientRequestId: options.clientRequestId,
      },
    },
    select: { id: true, type: true, status: true },
  });
  if (job === null) return undefined;
  if (job.type !== options.type) {
    throw ApiError.conflict(
      `clientRequestId "${options.clientRequestId}" already names one of your ${job.type} drafts; choose a new id for this ${options.type}.`,
      { jobId: job.id, type: job.type },
    );
  }
  return { jobId: job.id, status: job.status, isDuplicate: true };
}

function isClientRequestCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
