import { randomUUID } from "node:crypto";
import type {
  ChildProfile,
  ContentStatus,
  Lesson,
  Parent,
  Prisma,
  Session,
  Subject,
  Topic,
  World,
} from "@kidlearn/db";
import { prisma } from "../../config/prisma.js";

function unique(): string {
  return randomUUID().slice(0, 8);
}

export async function createParent(
  overrides: Partial<Prisma.ParentUncheckedCreateInput> = {},
): Promise<Parent> {
  const suffix = unique();
  const email = overrides.email ?? `parent-${suffix}@example.test`;
  const user = await prisma.user.create({
    data: { id: `user-${suffix}`, name: "Test Parent", email },
  });
  return prisma.parent.create({
    data: {
      googleId: `google-${suffix}`,
      email,
      ...overrides,
      userId: overrides.userId ?? user.id,
    },
  });
}

export async function createSession(
  userId: string,
  overrides: Partial<Prisma.SessionUncheckedCreateInput> = {},
): Promise<Session> {
  const suffix = unique();
  return prisma.session.create({
    data: {
      id: `session-${suffix}`,
      token: `token-${suffix}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      userId,
      ...overrides,
    },
  });
}

export async function createChild(
  parentId: string,
  overrides: Partial<Prisma.ChildProfileUncheckedCreateInput> = {},
): Promise<ChildProfile> {
  return prisma.childProfile.create({
    data: {
      firstName: "Mina",
      age: 4,
      gradeLevel: "KG1",
      parentId,
      ...overrides,
    },
  });
}

export interface Curriculum {
  world: World;
  subject: Subject;
  topic: Topic;
  lesson: Lesson;
}

/** Every level at `status` (published by default); override one level's status to make just it differ. */
export async function createCurriculum(
  status: ContentStatus = "published",
  overrides: {
    world?: Partial<Prisma.WorldUncheckedCreateInput>;
    subject?: Partial<Prisma.SubjectUncheckedCreateInput>;
    topic?: Partial<Prisma.TopicUncheckedCreateInput>;
    lesson?: Partial<Prisma.LessonUncheckedCreateInput>;
  } = {},
): Promise<Curriculum> {
  const suffix = unique();
  const world = await prisma.world.create({
    data: {
      slug: `world-${suffix}`,
      name: "Test World",
      palette: { primary: "#2E7D32" },
      status,
      ...overrides.world,
    },
  });
  const subject = await prisma.subject.create({
    data: {
      slug: `subject-${suffix}`,
      name: "Test Subject",
      gradeLevels: ["KG1"],
      status,
      ...overrides.subject,
    },
  });
  const topic = await prisma.topic.create({
    data: {
      subjectId: subject.id,
      slug: `topic-${suffix}`,
      name: "Test Topic",
      gradeLevels: ["KG1"],
      status,
      ...overrides.topic,
    },
  });
  const lesson = await prisma.lesson.create({
    data: {
      topicId: topic.id,
      worldId: world.id,
      slug: `lesson-${suffix}`,
      title: "Test Lesson",
      gradeLevels: ["KG1"],
      status,
      translations: {
        create: { language: "en", title: "Test Lesson", introScript: "Hi!" },
      },
      ...overrides.lesson,
    },
  });
  return { world, subject, topic, lesson };
}
