import type { ChildProfile } from "@kidlearn/db";
import { validDragDrop, validMcq } from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma.js";
import {
  type Curriculum,
  createChild,
  createCurriculum,
  createParent,
} from "../../shared/testing/factories.js";
import {
  getLessonForChild,
  listLessonsForChild,
  listSubjectsForChild,
  listWorldLessonsForChild,
} from "./content.service.js";

const log = { error: vi.fn(), warn: vi.fn() };

let child: ChildProfile;

beforeEach(async () => {
  const parent = await createParent();
  child = await createChild(parent.id, { gradeLevel: "KG1" });
});

async function reach({ world, topic, lesson }: Curriculum) {
  const detail = await getLessonForChild(child, lesson.id, log).then(
    () => true,
    () => false,
  );
  const inTopic = await listLessonsForChild(child, topic.id).then(
    (lessons) => lessons.some(({ id }) => id === lesson.id),
    () => false,
  );
  const inWorld = await listWorldLessonsForChild(child, world.id).then(
    (groups) =>
      groups.some((group) => group.lessons.some(({ id }) => id === lesson.id)),
    () => false,
  );
  return { detail, inTopic, inWorld };
}

describe("the student visibility gate against Postgres", () => {
  it("serves a lesson whose whole chain is published for the child's grade", async () => {
    const curriculum = await createCurriculum();

    expect(await reach(curriculum)).toEqual({
      detail: true,
      inTopic: true,
      inWorld: true,
    });
  });

  it.each([
    "world",
    "subject",
    "topic",
    "lesson",
  ] as const)("hides the lesson everywhere when its %s is a draft", async (level) => {
    const curriculum = await createCurriculum("published", {
      [level]: { status: "draft" },
    });

    expect(await reach(curriculum)).toEqual({
      detail: false,
      inTopic: false,
      inWorld: false,
    });
  });

  it.each([
    "in_review",
    "approved",
    "rejected",
    "archived",
  ] as const)("treats %s as not published", async (status) => {
    const curriculum = await createCurriculum("published", {
      lesson: { status },
    });

    expect((await reach(curriculum)).detail).toBe(false);
  });

  it.each([
    "subject",
    "topic",
    "lesson",
  ] as const)("hides the lesson when its %s is tagged for another grade", async (level) => {
    const curriculum = await createCurriculum("published", {
      [level]: { gradeLevels: ["NURSERY"] },
    });

    expect((await reach(curriculum)).detail).toBe(false);
  });

  it("lists no subject whose only lesson is a draft", async () => {
    const live = await createCurriculum();
    const dead = await createCurriculum("published", {
      lesson: { status: "draft" },
    });

    const ids = (await listSubjectsForChild(child)).map(({ id }) => id);

    expect(ids).toContain(live.subject.id);
    expect(ids).not.toContain(dead.subject.id);
  });
});

describe("relations loaded with include carry their own gate", () => {
  async function lessonWith(status: {
    activity: "draft" | "published";
    quiz: "draft" | "published";
  }) {
    const activity = await prisma.activity.create({
      data: {
        type: "drag_drop",
        definition: validDragDrop,
        status: status.activity,
      },
    });
    const quiz = await prisma.quiz.create({
      data: {
        status: status.quiz,
        questions: {
          create: { format: "mcq", definition: validMcq, sortOrder: 0 },
        },
      },
    });
    return createCurriculum("published", {
      lesson: { activityId: activity.id, quizId: quiz.id },
    });
  }

  it("serves a published activity and quiz", async () => {
    const { lesson } = await lessonWith({
      activity: "published",
      quiz: "published",
    });

    const detail = await getLessonForChild(child, lesson.id, log);

    expect(detail.activity?.type).toBe("drag_drop");
    expect(detail.quiz?.questions).toHaveLength(1);
  });

  it("omits a draft activity and a draft quiz from a published lesson", async () => {
    const { lesson } = await lessonWith({ activity: "draft", quiz: "draft" });

    const detail = await getLessonForChild(child, lesson.id, log);

    expect(detail.activity).toBeNull();
    expect(detail.quiz).toBeNull();
  });
});
