import type { PlatformOverview } from "@kidlearn/types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { learningTimeWindow } from "../progress/learning-time.service.js";

export async function getPlatformOverview(
  now = new Date(),
): Promise<PlatformOverview> {
  const day = learningTimeWindow("today", now, env.APP_TIMEZONE);
  const week = learningTimeWindow("week", now, env.APP_TIMEZONE);

  const [totalParents, totalChildren, lessonsCompletedThisWeek, activeToday] =
    await Promise.all([
      prisma.parent.count(),
      prisma.childProfile.count(),
      prisma.lessonProgress.count({
        where: { completedAt: { gte: week.from, lt: week.to } },
      }),
      // `groupBy`, not `findMany({ distinct })`: Prisma dedupes `distinct` in the query engine, so it would
      // pull every heartbeat of the day (one per 20–30s per child) just to count children.
      prisma.sessionEvent.groupBy({
        by: ["childId"],
        where: { occurredAt: { gte: day.from, lt: day.to } },
      }),
    ]);

  return {
    totalParents,
    totalChildren,
    lessonsCompletedThisWeek,
    dauToday: activeToday.length,
    generatedAt: now.toISOString(),
  };
}
