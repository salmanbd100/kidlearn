// The contract between a text-generation client and `runGenerationJob`.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Why the model stopped, in this pipeline's own vocabulary rather than a
 * provider's.
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
