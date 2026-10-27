import type { RequestHandler } from "express";
import { env, isGeminiConfigured } from "../../../config/env.js";
import { ApiError } from "../../../shared/errors/errors.js";

export function geminiNotConfigured(): ApiError {
  return new ApiError(
    503,
    "AI_PROVIDER_NOT_CONFIGURED",
    "Gemini is not configured on this server. Author content with your own AI assistant over MCP instead.",
  );
}

// Ahead of the budget check: a 429 would tell the admin to wait for a quota this server never spends.
export const requireGemini: RequestHandler = (_req, _res, next) => {
  next(isGeminiConfigured(env) ? undefined : geminiNotConfigured());
};
