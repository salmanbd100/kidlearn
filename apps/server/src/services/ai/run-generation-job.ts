import type { AIJobType, Prisma } from "@kidlearn/db";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { GenerationStopReason, TokenUsage } from "./types.js";

/**
 * The `AIGenerationJob` lifecycle, shared by every generator (FR-AI-08).
 *
 * `pending → generating → awaiting_review | failed`. The three parts a generator
 * supplies are the prompt call, the schema its answer must satisfy, and the write
 * that turns a valid answer into draft rows. Everything else — the row, the
 * status moves, the one retry, the audit trail — is here, so a new generator in
 * files 35–36 is a prompt and a `persist`, not a second copy of this.
 *
 * **Every attempt is kept, valid or not.** `rawOutput` holds the verbatim JSON of
 * both attempts plus the token usage they cost, which is the whole of FR-AI-08: a
 * reviewer looking at a bad lesson can see exactly what the model was asked and
 * exactly what it said, and a failed job is readable rather than just red.
 *
 * **Exactly one retry, and only for a schema failure.** A validation miss is
 * something the model can fix when shown its own issues; a 401, a 429 or a
 * rejected write is not, and a second identical request would only spend the
 * quota twice. Two of the model's own stops are not validation misses either,
 * though they arrive looking like one: a refusal and an answer cut off at the
 * token ceiling both leave the JSON missing or half-written. Both are failed here
 * by name rather than retried and then reported as invalid JSON.
 *
 * **Nothing here can publish.** `persist` runs inside a transaction and writes
 * draft rows carrying `jobId`; the job lands on `awaiting_review` and stops. That
 * is the structural half of FR-AI-07 — the half that holds before file 37's
 * review queue exists, because there is no code path from this function to
 * `status: "published"`.
 */

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
 *
 * A retry exists to show the model its own validation errors. Neither of these is
 * one: a refusal is a decision the same prompt will reach again, and an answer cut
 * off at the token ceiling will be cut off at the same place. Reported by name
 * because the alternative — "failed schema validation on both attempts" — sends
 * whoever reads the job looking at the schema for a fault that is not there
 * (FR-AI-08).
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
 *
 * The attempts are rebuilt field by field rather than handed over as they are,
 * because `Prisma.InputJsonObject` is structural and `Attempt` is not: mapping
 * them here is what makes the JSONB write type-checked instead of cast.
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

/**
 * Zod issues as the lines the retry shows the model.
 *
 * `issues` rather than `flatten()`, deliberately: the lesson output nests quiz
 * questions inside an array, and `flatten()` collapses every nested path into one
 * `formErrors` bucket that names no field. `quizQuestions.2.options: too_small`
 * is something a model can act on.
 */
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
