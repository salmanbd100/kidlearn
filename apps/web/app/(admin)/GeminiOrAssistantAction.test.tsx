import type { AiCapabilities } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { GeminiOrAssistantAction } from "./GeminiOrAssistantAction";

const capabilities = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("@/app/(admin)/context/ai-capabilities", () => ({
  useAiCapabilities: () => capabilities.value,
}));

const BASE: AiCapabilities = {
  geminiText: true,
  geminiImage: true,
  narration: true,
  mcp: {
    enabled: true,
    oauth: false,
    url: "https://api.test/mcp",
    draftsPerDay: 30,
  },
};

function renderAction() {
  render(
    <GeminiOrAssistantAction>
      <button type="button">Generate lesson</button>
    </GeminiOrAssistantAction>,
  );
}

beforeEach(() => {
  capabilities.value = undefined;
});

describe("GeminiOrAssistantAction", () => {
  it("keeps the Generate button while capabilities are still loading", () => {
    renderAction();
    expect(
      screen.getByRole("button", { name: "Generate lesson" }),
    ).toBeInTheDocument();
  });

  it("keeps the Generate button when Gemini is configured", () => {
    capabilities.value = BASE;
    renderAction();
    expect(
      screen.getByRole("button", { name: "Generate lesson" }),
    ).toBeInTheDocument();
  });

  it("swaps it for the AI assistants page when Gemini is off and MCP is on", () => {
    capabilities.value = { ...BASE, geminiText: false };
    renderAction();

    expect(
      screen.queryByRole("button", { name: "Generate lesson" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Write with your AI assistant/ }),
    ).toHaveAttribute("href", ADMIN_ROUTES.aiAssistants);
  });

  it("shows nothing when neither is available, rather than a button that only 503s", () => {
    capabilities.value = {
      ...BASE,
      geminiText: false,
      mcp: { ...BASE.mcp, enabled: false, url: null },
    };
    renderAction();

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
