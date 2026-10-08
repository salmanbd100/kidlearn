import { type AIJobType, Prisma } from "@kidlearn/db";
import type { z } from "zod";
import { prisma } from "../../../config/prisma.js";
import { withSerializationRetry } from "../../../shared/utils/serializable-retry.js";
import { assertWithinDailyCap } from "./rate-guard.js";
import { failStaleJobs } from "./stale-jobs.js";
import type { GenerationStopReason, TokenUsage } from "./types.js";

export function buildRetryFeedback(flattenedIssues: string): string {
  return [
    "Your previous response failed schema validation. Errors:",
    flattenedIssues,
    "Respond again with corrected JSON. Keep every field that was already valid unchanged.",
  ].join("\n");
}

export interface GenerationJobResult {
  jobId: string;
  status: "awaiting_review" | "failed";
}

export interface RunGenerationJobOptions<TParsed> {
  type: AIJobType;
  input: Prisma.JsonObject;
  generate: (retryFeedback?: string) => Promise<{
    raw: unknown;
    usage: TokenUsage;
    stopReason?: GenerationStopReason | null;
    refusal?: string;
  }>;
  /** Input is `unknown`: it is JSON the model wrote, and some schemas build their keys per request. */
  schema: z.ZodType<TParsed, z.ZodTypeDef, unknown>;
  persist: (
    parsed: TParsed,
    jobId: string,
    tx: Prisma.TransactionClient,
  ) => Promise<Prisma.JsonObject>;
}

type Attempt = {
  attempt: number;
  raw: Prisma.InputJsonValue;
  usage: TokenUsage;
  issues?: string;
  stopReason?: GenerationStopReason | null;
};

const MAX_ATTEMPTS = 2;

export async function runGenerationJob<TParsed>(
  options: RunGenerationJobOptions<TParsed>,
): Promise<GenerationJobResult> {
  await failStaleJobs();

  // Re-checked in the same Serializable transaction that creates the row: the request-level check
  // reads the count before any row exists, so parallel requests all pass it.
  const job = await withSerializationRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await assertWithinDailyCap(options.type, 1, tx);
        return tx.aIGenerationJob.create({
          data: { type: options.type, input: options.input, status: "pending" },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  await prisma.aIGenerationJob.update({
    where: { id: job.id },
    data: { status: "generating" },
  });

  const attempts: Attempt[] = [];

  const fail = async (error: string): Promise<GenerationJobResult> => {
    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: { status: "failed", rawOutput: auditRecord(attempts, { error }) },
    });
    return { jobId: job.id, status: "failed" };
  };

  let parsed: TParsed | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const feedback =
      attempt === 1 ? undefined : buildRetryFeedback(attempts[0].issues ?? "");

    let generated: Awaited<ReturnType<typeof options.generate>>;
    try {
      generated = await options.generate(feedback);
    } catch (error) {
      return fail(describe(error));
    }

    const result = options.schema.safeParse(generated.raw);
    attempts.push({
      attempt,
      raw: toJson(generated.raw),
      usage: generated.usage,
      ...(generated.stopReason === undefined
        ? {}
        : { stopReason: generated.stopReason }),
      ...(result.success ? {} : { issues: flatten(result.error) }),
    });

    if (result.success) {
      parsed = result.data;
      break;
    }

    const unretryable = describeUnretryableStop(generated);
    if (unretryable !== undefined) return fail(unretryable);
  }

  if (parsed === undefined) {
    return fail(
      `The model failed schema validation on both attempts:\n${attempts[attempts.length - 1]?.issues ?? ""}`,
    );
  }

  // A `const` so the narrowing survives into the closure below.
  const validated = parsed;

  // `validated` is JSON by construction (JSON.parse then a Zod parse) but not `Prisma.InputJsonValue` to the compiler.
  const parsedJson = toJson(validated);

  let entities: Prisma.JsonObject;
  try {
    entities = await prisma.$transaction((tx) =>
      options.persist(validated, job.id, tx),
    );
  } catch (error) {
    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        rawOutput: auditRecord(attempts, {
          parsed: parsedJson,
          error: describe(error),
        }),
      },
    });
    return { jobId: job.id, status: "failed" };
  }

  await prisma.aIGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "awaiting_review",
      rawOutput: auditRecord(attempts, { parsed: parsedJson, entities }),
    },
  });

  return { jobId: job.id, status: "awaiting_review" };
}

function describeUnretryableStop(generated: {
  stopReason?: GenerationStopReason | null;
  refusal?: string;
}): string | undefined {
  switch (generated.stopReason) {
    case "refusal":
      return `The model declined to answer (stopReason: refusal${
        generated.refusal === undefined ? "" : ` — ${generated.refusal}`
      }). Not retried: the same prompt would be declined again.`;
    case "max_tokens":
      return "The model's answer was cut off before the JSON was complete (stopReason: max_tokens), so there was nothing whole to validate. Not retried: an identical request would be cut off identically. Raise the generation token ceiling or ask for less in one call.";
    default:
      return undefined;
  }
}

function auditRecord(
  attempts: Attempt[],
  outcome: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  return {
    attempts: attempts.map((one) => ({
      attempt: one.attempt,
      raw: one.raw,
      usage: {
        inputTokens: one.usage.inputTokens,
        outputTokens: one.usage.outputTokens,
      },
      ...(one.stopReason === undefined || one.stopReason === null
        ? {}
        : { stopReason: one.stopReason }),
      ...(one.issues === undefined ? {} : { issues: one.issues }),
    })),
    usage: totalUsage(attempts),
    ...outcome,
  };
}

// A failed attempt is billed too, so the total counts both.
function totalUsage(attempts: Attempt[]): Prisma.InputJsonObject {
  return {
    inputTokens: attempts.reduce((sum, one) => sum + one.usage.inputTokens, 0),
    outputTokens: attempts.reduce(
      (sum, one) => sum + one.usage.outputTokens,
      0,
    ),
    attempts: attempts.length,
  };
}

function flatten(error: z.ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("\n");
}

function toJson(value: unknown): Prisma.InputJsonValue {
  // JSONB column boundary: JSON by construction, `unknown` to the compiler.
  return (value ?? null) as Prisma.InputJsonValue;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
