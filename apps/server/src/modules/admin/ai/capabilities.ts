import type { AiCapabilities } from "@kidlearn/types";
import { type Env, isGeminiConfigured } from "../../../config/env.js";

export function readCapabilities(
  config: Pick<
    Env,
    "GEMINI_API_KEY" | "MCP_ENABLED" | "MCP_RESOURCE_URL" | "MCP_DRAFTS_PER_DAY"
  >,
): AiCapabilities {
  const hasGemini = isGeminiConfigured(config);

  return {
    geminiText: hasGemini,
    geminiImage: hasGemini,
    // Cloud TTS, not Gemini: its key is required at boot (`env.ts`), so a running server can always narrate.
    narration: true,
    mcp: {
      enabled: config.MCP_ENABLED,
      // OAuth connectors are Phase C of file 41; access tokens are the only credential until then.
      oauth: false,
      url: config.MCP_ENABLED ? config.MCP_RESOURCE_URL : null,
      draftsPerDay: config.MCP_DRAFTS_PER_DAY,
    },
  };
}
