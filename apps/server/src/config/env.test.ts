import { describe, expect, it } from "vitest";
import { EnvSchema, isLocalUrl } from "./env.js";

describe("isLocalUrl", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:4000",
    "http://[::1]:4000",
    "http://app.localhost:3000",
  ])("treats %s as local", (url) => {
    expect(isLocalUrl(url)).toBe(true);
  });

  it.each([
    "https://app.kidlearn.example",
    "https://localhost.kidlearn.example",
  ])("treats %s as a deployed origin", (url) => {
    expect(isLocalUrl(url)).toBe(false);
  });
});

describe("MCP configuration", () => {
  const BASE = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db.example:5432/kidlearn",
    WEB_ORIGIN: "https://kidlearn.example",
    BETTER_AUTH_URL: "https://api.kidlearn.example",
    BETTER_AUTH_SECRET: "x".repeat(32),
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    CRON_SECRET: "c".repeat(16),
    CLOUDINARY_CLOUD_NAME: "n",
    CLOUDINARY_API_KEY: "k",
    CLOUDINARY_API_SECRET: "s",
    GOOGLE_TTS_API_KEY: "t",
  };

  it("defaults the resource URL to the API origin's /mcp", () => {
    const parsed = EnvSchema.parse({ ...BASE, MCP_ENABLED: "true" });
    expect(parsed.MCP_RESOURCE_URL).toBe("https://api.kidlearn.example/mcp");
  });

  it("refuses a plain-HTTP MCP endpoint in production, where a token would cross the wire in clear", () => {
    const result = EnvSchema.safeParse({
      ...BASE,
      MCP_ENABLED: "true",
      MCP_RESOURCE_URL: "http://api.kidlearn.example/mcp",
    });
    expect(result.success).toBe(false);
  });

  it("boots without a Gemini key, and treats an empty one as unset", () => {
    expect(EnvSchema.parse(BASE).GEMINI_API_KEY).toBeUndefined();
    expect(
      EnvSchema.parse({ ...BASE, GEMINI_API_KEY: "" }).GEMINI_API_KEY,
    ).toBeUndefined();
  });
});
