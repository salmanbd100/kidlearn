import type { ChildProfile, ContentStatus, GradeLevel } from "@kidlearn/db";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import { createChild, createParent } from "../../shared/testing/factories.js";
import { getStoryForChild, listStoriesForChild } from "./story.service.js";

// The story library's status gate on the rows Postgres returns. A story is
// visible only when it and its world are both published and it is tagged for
// the child's grade; `stories.routes.test.ts` asserts the `where` it builds.

let child: ChildProfile;

beforeEach(async () => {
  const parent = await createParent();
  child = await createChild(parent.id, { gradeLevel: "KG1" });
});

let counter = 0;

async function createStory(
  options: {
    status?: ContentStatus;
    worldStatus?: ContentStatus;
    gradeLevels?: GradeLevel[];
  } = {},
) {
  counter += 1;
  const world = await prisma.world.create({
    data: {
      slug: `story-world-${counter}`,
      name: "Story World",
      palette: { primary: "#2E7D32" },
      status: options.worldStatus ?? "published",
    },
  });
  return prisma.story.create({
    data: {
      slug: `story-${counter}`,
      title: "The Brave Hen",
      theme: "courage",
      worldId: world.id,
      gradeLevels: options.gradeLevels ?? ["KG1"],
      status: options.status ?? "published",
      translations: { create: { language: "en", title: "The Brave Hen" } },
      pages: {
        create: {
          sortOrder: 0,
          translations: {
            create: { language: "en", text: "Once upon a time." },
          },
        },
      },
    },
  });
}

async function reach(storyId: string) {
  const listed = (await listStoriesForChild(child)).some(
    ({ id }) => id === storyId,
  );
  const opened = await getStoryForChild(child, storyId).then(
    () => true,
    () => false,
  );
  return { listed, opened };
}

describe("the story visibility gate against Postgres", () => {
  it("serves a published story in a published world for the child's grade", async () => {
    const story = await createStory();

    expect(await reach(story.id)).toEqual({ listed: true, opened: true });
  });

  it.each([
    ["the story is a draft", { status: "draft" as const }],
    ["the story is in review", { status: "in_review" as const }],
    ["its world is a draft", { worldStatus: "draft" as const }],
    ["it is tagged for another grade", { gradeLevels: ["NURSERY" as const] }],
  ])("hides it when %s", async (_, options) => {
    const story = await createStory(options);

    expect(await reach(story.id)).toEqual({ listed: false, opened: false });
  });
});
