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
