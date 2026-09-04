/**
 * The contract between a text-generation client and `runGenerationJob`.
 *
 * Its own module rather than the client's, because the orchestrator must not
 * import the provider (file 37a): the retry loop, the audit trail and the
 * transaction handling are provider-agnostic, and a type import from
 * `gemini-text.ts` would be the one line making that untrue.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Why the model stopped, in this pipeline's own vocabulary rather than a
 * provider's.
 *
 * Three values because three are all `runGenerationJob` can act on: a normal
 * finish, an answer cut off at the token ceiling, and a refusal. A provider's own
 * taxonomy is mapped onto these by its client (`gemini-text.ts`), and anything
 * outside them is reported as `null` — an unrecognised stop is treated as a
 * normal one, which is the safe default: it costs one retry rather than failing a
 * generation the model may well have completed.
 */
export type GenerationStopReason = "stop" | "max_tokens" | "refusal";

export interface StructuredGeneration {
  /** The model's JSON exactly as it parsed. Never narrowed here. */
  raw: unknown;
  usage: TokenUsage;
  /**
   * Carried out so the caller can tell a *bad answer* from *no answer*. A refusal
   * or a `max_tokens` stop leaves the JSON missing or half-written, which looks
   * exactly like a schema failure from `raw` alone — and retrying either one buys
   * a second identical outcome.
   */
  stopReason: GenerationStopReason | null;
  /** The provider's own reason, present only on a `refusal` stop. */
  refusal?: string;
}
