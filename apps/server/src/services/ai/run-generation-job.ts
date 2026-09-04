import type { AIJobType, Prisma } from "@kidlearn/db";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { GenerationStopReason, TokenUsage } from "./types.js";

// The `AIGenerationJob` lifecycle, shared by every generator (FR-AI-08).

/** The feedback appended to the conversation before the single retry. */
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
  /** Everything the admin sent, plus prompt metadata. Audit only — never re-read. */
  input: Prisma.JsonObject;
  generate: (retryFeedback?: string) => Promise<{
    raw: unknown;
    usage: TokenUsage;
    /** Optional so a stub may omit it; the Gemini client always reports it. */
    stopReason?: GenerationStopReason | null;
    refusal?: string;
  }>;
  /**
   * The contract. Its *input* is `unknown` rather than `TParsed`: what is being
   * parsed is JSON the model wrote, and a generator whose schema builds its own
   * keys per request (`schemas/lesson.ts`) cannot claim otherwise.
   */
  schema: z.ZodType<TParsed, z.ZodTypeDef, unknown>;
  /** Creates the draft rows. Returns their ids for the audit record. */
  persist: (
    parsed: TParsed,
    jobId: string,
    tx: Prisma.TransactionClient,
  ) => Promise<Prisma.JsonObject>;
}

/** One call to the model, kept whether or not it validated. */
type Attempt = {
  attempt: number;
  raw: Prisma.InputJsonValue;
  usage: TokenUsage;
  /** Absent when the attempt parsed. */
  issues?: string;
  /** Absent only when the caller does not report one. */
  stopReason?: GenerationStopReason | null;
};

const MAX_ATTEMPTS = 2;

export async function runGenerationJob<TParsed>(
  options: RunGenerationJobOptions<TParsed>,
): Promise<GenerationJobResult> {
  const job = await prisma.aIGenerationJob.create({
    data: { type: options.type, input: options.input, status: "pending" },
    select: { id: true },
  });

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

  // Held in a `const` so the narrowing above survives into the closure below —
  // the compiler widens a `let` back to `TParsed | undefined` there.
  const validated = parsed;

  // `validated` is not `Prisma.InputJsonValue` to the compiler — it is whatever
  // the caller's schema infers — but it is by construction JSON: it came from a
  // `JSON.parse` and a Zod parse that only ever narrows. Stored so a reviewer
  // sees what was actually written from, not just what was said.
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

/**
 * The two stops that are not worth a second call, named rather than fed back.
 */
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

/**
 * The whole audit trail for one job (FR-AI-08): every attempt verbatim, what they
 * cost together, and whatever the caller has to add about the outcome.
 */
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

/**
 * What both attempts cost together. A failed attempt is billed too, so a total
 * that counted only the successful one would under-report every retried job.
 */
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

/** Zod issues as the lines the retry shows the model. */
function flatten(error: z.ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("\n");
}

/** JSONB accepts `null`; `undefined` would drop the key instead of recording it. */
function toJson(value: unknown): Prisma.InputJsonValue {
  // The values reaching here are the model's parsed JSON and Zod parse output —
  // JSON by construction, but `unknown` to the compiler because the schema is the
  // caller's. This is the JSONB column boundary.
  return (value ?? null) as Prisma.InputJsonValue;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
