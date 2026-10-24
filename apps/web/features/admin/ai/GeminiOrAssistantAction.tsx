"use client";

import type { AiCapabilities } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { Bot } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";

/**
 * A Gemini Generate button, or — once the server says Gemini is off — a link to the AI assistants page
 * when MCP is on, and nothing when it is not. Shown as-is while capabilities are still loading (`undefined`).
 * Takes the capabilities rather than reading them: the context lives in the `(admin)` route group, and a feature does
 * not import from `app/`.
 */
export function GeminiOrAssistantAction({
  capabilities,
  capability = "geminiText",
  children,
}: {
  capabilities: AiCapabilities | undefined;
  capability?: "geminiText" | "geminiImage";
  children: ReactNode;
}) {
  if (capabilities?.[capability] !== false) return <>{children}</>;
  if (!capabilities.mcp.enabled) return null;

  return (
    <Button asChild variant="outline">
      <Link href={ADMIN_ROUTES.aiAssistants}>
        <Bot aria-hidden="true" className="size-4!" />
        Write with your AI assistant
      </Link>
    </Button>
  );
}
