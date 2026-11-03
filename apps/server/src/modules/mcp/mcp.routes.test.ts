import { describe, expect, it } from "vitest";
import { readClientInfo } from "./mcp.routes.js";

describe("readClientInfo", () => {
  it("reads the 2026-07-28 envelope", () => {
    const body = {
      method: "tools/call",
      params: {
        _meta: {
          "io.modelcontextprotocol/clientInfo": {
            name: "claude-ai",
            version: "1.4",
          },
        },
      },
    };
    expect(readClientInfo(body, "node")).toEqual({
      name: "claude-ai",
      version: "1.4",
    });
  });

  it("falls back to the User-Agent's first product for a 2025-era request", () => {
    expect(readClientInfo({ params: {} }, "cursor/1.7.2 (darwin)")).toEqual({
      name: "cursor",
      version: "1.7.2",
    });
  });

  it("caps what a client may write into the audit record", () => {
    const info = readClientInfo(
      {
        params: {
          _meta: {
            "io.modelcontextprotocol/clientInfo": {
              name: "x".repeat(500),
              version: 3,
            },
          },
        },
      },
      undefined,
    );
    expect(info).toEqual({ name: "x".repeat(100), version: null });
  });

  it("is null when the client says nothing about itself", () => {
    expect(readClientInfo(undefined, undefined)).toBeNull();
    expect(readClientInfo("not json", "  ")).toBeNull();
  });
});
