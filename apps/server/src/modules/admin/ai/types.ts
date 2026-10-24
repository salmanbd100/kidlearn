export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type GenerationStopReason = "stop" | "max_tokens" | "refusal";

export interface StructuredGeneration {
  raw: unknown;
  usage: TokenUsage;
  /** Distinguishes a bad answer from no answer; a refusal or `max_tokens` stop looks like a schema failure from `raw` alone. */
  stopReason: GenerationStopReason | null;
  refusal?: string;
}

/** Who asked for a job (FR-AI-08). Optional so a job started outside a request still runs; the routes always pass it. */
export interface GenerationContext {
  requestedById?: string;
}
