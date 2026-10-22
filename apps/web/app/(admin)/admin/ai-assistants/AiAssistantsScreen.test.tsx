import type { AdminAccessToken, AiCapabilities } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistantsScreen } from "./AiAssistantsScreen";

const api = vi.hoisted(() => ({
  fetchAccessTokens: vi.fn(),
  createAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));
const capabilities = vi.hoisted(() => ({
  value: undefined as unknown,
  hasFailed: false,
  retry: vi.fn(),
}));

vi.mock("@/features/admin/api/ai-api", () => api);
vi.mock("@/app/(admin)/context/ai-capabilities", () => ({
  useAiCapabilitiesLoad: () => ({
    capabilities: capabilities.value,
    hasFailed: capabilities.hasFailed,
    retry: capabilities.retry,
  }),
}));

const ENABLED: AiCapabilities = {
  geminiText: false,
  geminiImage: false,
  narration: true,
  mcp: {
    enabled: true,
    oauth: false,
    url: "https://api.kidlearn.test/mcp",
    draftsPerDay: 30,
  },
};

const TOKEN: AdminAccessToken = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cursor — desktop",
  prefix: "klat_abcdefg",
  scopes: ["mcp:drafts"],
  expiresAt: "2099-01-01T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-10-20T00:00:00.000Z",
};

const SECRET = `klat_${"s".repeat(43)}`;

beforeEach(() => {
  capabilities.value = ENABLED;
  capabilities.hasFailed = false;
  capabilities.retry.mockReset();
  api.fetchAccessTokens.mockReset();
  api.fetchAccessTokens.mockResolvedValue({
    ok: true,
    data: { tokens: [TOKEN] },
  });
  api.createAccessToken.mockReset();
  api.revokeAccessToken.mockReset();
});

describe("AiAssistantsScreen", () => {
  it("offers a retry when the server's settings could not be read", () => {
    capabilities.value = undefined;
    capabilities.hasFailed = true;

    render(<AiAssistantsScreen />);

    expect(
      screen.getByText("Assistant settings could not be loaded."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(capabilities.retry).toHaveBeenCalledOnce();
    expect(api.fetchAccessTokens).not.toHaveBeenCalled();
  });

  it("shows no error while the settings are still loading", () => {
    capabilities.value = undefined;

    render(<AiAssistantsScreen />);

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("explains that access is off rather than offering tokens nobody can use", () => {
    capabilities.value = {
      ...ENABLED,
      mcp: { ...ENABLED.mcp, enabled: false, url: null },
    };

    render(<AiAssistantsScreen />);

    expect(
      screen.getByText("Assistant access is switched off on this server."),
    ).toBeInTheDocument();
    expect(api.fetchAccessTokens).not.toHaveBeenCalled();
  });

  it("lists tokens by name and prefix, never a secret", async () => {
    render(<AiAssistantsScreen />);

    expect(await screen.findByText("Cursor — desktop")).toBeInTheDocument();
    expect(screen.getByText("klat_abcdefg…")).toBeInTheDocument();
  });

  it("shows a new token's secret once, and puts it in the client snippets", async () => {
    api.createAccessToken.mockResolvedValue({
      ok: true,
      data: { token: { ...TOKEN, id: "new", name: "Laptop" }, secret: SECRET },
    });
    render(<AiAssistantsScreen />);
    await screen.findByText("Cursor — desktop");

    fireEvent.change(screen.getByLabelText("Token name"), {
      target: { value: "Laptop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    expect(
      await screen.findByText(/it will not be shown again/),
    ).toBeInTheDocument();
    expect(api.createAccessToken).toHaveBeenCalledWith({
      name: "Laptop",
      expiresInDays: 7,
    });
    expect(
      screen.getAllByText((text) => text.includes(SECRET)).length,
    ).toBeGreaterThan(1);

    const done = screen.getByRole("button", { name: "Done" });
    done.focus();
    fireEvent.click(done);
    expect(screen.queryAllByText((text) => text.includes(SECRET))).toHaveLength(
      0,
    );
    expect(screen.getByRole("heading", { name: "Your tokens" })).toHaveFocus();
  });

  it("revokes a token and stops offering to revoke it again", async () => {
    api.revokeAccessToken.mockResolvedValue({
      ok: true,
      data: { ...TOKEN, revokedAt: "2026-10-22T00:00:00.000Z" },
    });
    render(<AiAssistantsScreen />);
    await screen.findByText("Cursor — desktop");

    const revoke = screen.getByRole("button", { name: "Revoke" });
    revoke.focus();
    fireEvent.click(revoke);

    await waitFor(() =>
      expect(screen.getByText("Revoked")).toBeInTheDocument(),
    );
    expect(screen.getByText("Cursor — desktop").closest("li")).toHaveFocus();
    expect(api.revokeAccessToken).toHaveBeenCalledWith(TOKEN.id);
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });
});
