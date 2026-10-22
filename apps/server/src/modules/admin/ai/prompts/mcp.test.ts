import { describe, expect, it } from "vitest";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import {
  buildAuthoringGuide,
  SUBMIT_LESSON_DESCRIPTION,
  SUBMIT_QUIZ_DESCRIPTION,
  SUBMIT_STORY_DESCRIPTION,
} from "./mcp.js";

describe("the authoring guide", () => {
  const guide = buildAuthoringGuide();

  it("carries the Gemini prompt's hard rules", () => {
    expect(guide).toContain("Culturally neutral");
    expect(guide).toContain("absolutely no violence");
  });

  it("points the assistant at the submit tools, not a tool it does not have", () => {
    // The Gemini prompt's last line names "the provided tool"; a stale copy would tell an MCP client to look for one.
    expect(guide).not.toContain("the provided tool");
    expect(guide).toContain("submit_* tools");
  });

  it("states that a person reviews everything", () => {
    expect(guide).toContain("A person reads it and decides");
  });
});

describe("the submit tool descriptions", () => {
  it.each([
    SUBMIT_LESSON_DESCRIPTION,
    SUBMIT_STORY_DESCRIPTION,
    SUBMIT_QUIZ_DESCRIPTION,
  ])("name the guide, the placeholder host and the review", (description) => {
    expect(description).toContain("get_authoring_guide");
    expect(description).toContain(PLACEHOLDER_ASSET_HOST);
    expect(description).toContain("AI Queue");
  });
});
