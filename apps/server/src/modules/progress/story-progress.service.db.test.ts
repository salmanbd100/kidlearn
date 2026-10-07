import type { ChildProfile } from "@kidlearn/db";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import { createChild, createParent } from "../../shared/testing/factories.js";
import { recordActivityEvent } from "./learning-time.service.js";
import { completeStory } from "./story-progress.service.js";

// The `story_start` lookup filters on a JSON path inside `payload`, which a Prisma stub cannot prove.

let child: ChildProfile;
let counter = 0;

beforeEach(async () => {
  child = await createChild((await createParent()).id);
});

async function createStory() {
  counter += 1;
  const world = await prisma.world.create({
    data: {
      slug: `read-world-${counter}`,
      name: "Story World",
      palette: { primary: "#2E7D32" },
      status: "published",
    },
  });
  return prisma.story.create({
    data: {
      slug: `read-story-${counter}`,
      title: "The Brave Hen",
      theme: "courage",
      worldId: world.id,
      gradeLevels: ["KG1"],
      status: "published",
      translations: { create: { language: "en", title: "The Brave Hen" } },
    },
  });
}

describe("completeStory against Postgres", () => {
  it("pays a story whose story_start was recorded", async () => {
    const story = await createStory();
    await recordActivityEvent(child, { type: "story_start", refId: story.id });

    await expect(completeStory(child, story.id)).resolves.toBeDefined();
  });

  it("refuses a story that was never opened", async () => {
    const story = await createStory();

    await expect(completeStory(child, story.id)).rejects.toMatchObject({
      details: { code: "STORY_NOT_STARTED" },
    });
  });

  it("does not accept a start recorded for a different story", async () => {
    const opened = await createStory();
    const unopened = await createStory();
    await recordActivityEvent(child, { type: "story_start", refId: opened.id });

    await expect(completeStory(child, unopened.id)).rejects.toMatchObject({
      details: { code: "STORY_NOT_STARTED" },
    });
  });

  it("does not accept a sibling's start", async () => {
    const story = await createStory();
    const sibling = await createChild(child.parentId, { firstName: "Rafi" });
    await recordActivityEvent(sibling, {
      type: "story_start",
      refId: story.id,
    });

    await expect(completeStory(child, story.id)).rejects.toMatchObject({
      details: { code: "STORY_NOT_STARTED" },
    });
  });
});
