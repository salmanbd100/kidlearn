"use client";

import { Button } from "@kidlearn/ui";
import { Bot } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAiCapabilities } from "@/app/(admin)/context/ai-capabilities";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";

/**
 * A Gemini Generate button, or — once the server says Gemini is off — a link to the AI assistants page
 * when MCP is on, and nothing when it is not. Shown as-is while capabilities are still loading.
 */
export function GeminiOrAssistantAction({
  capability = "geminiText",
  children,
}: {
  capability?: "geminiText" | "geminiImage";
  children: ReactNode;
}) {
  const capabilities = useAiCapabilities();
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
