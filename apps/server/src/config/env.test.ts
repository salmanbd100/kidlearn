import { describe, expect, it } from "vitest";
import { isLocalUrl } from "./env.js";

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
