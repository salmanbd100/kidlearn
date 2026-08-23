import type { PlatformOverview } from "@kidlearn/types";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { learningTimeWindow } from "./learningTimeService.js";

/**
 * Platform analytics for the admin CMS (FR-CMS-07, basic tier).
 *
 * **Aggregates only.** Four counts and a timestamp — nothing here names a parent,
 * a child or a household, which is what makes the page safe to put in front of an
 * internal reviewer who has no relationship with any of them (NFR-SAFE-02). A
 * figure that would need a row to be identified by belongs in Phase 2, behind a
 * decision about who may see it.
 *
 * The two windows come from `learningTimeWindow`, the same function the parent
 * dashboard and the weekly report use, rather than from a second copy of "which
 * seven days is this week". A platform whose Monday differed from a household's
 * would make every cross-check between this page and a dashboard wrong.
 */
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
      // `groupBy`, not `findMany({ distinct })`. Prisma's `distinct` is not SQL
      // `DISTINCT` — it issues a plain `SELECT` and dedupes in the query engine, so
      // it would pull every beat of the day across the whole platform to count the
      // children who sent them. A child at play writes a `heartbeat` every 20–30s
      // (`HEARTBEAT_MIN_INTERVAL_MS`), which is thousands of rows a refresh button
      // press should not move. `groupBy` returns one row per child from the
      // database, and reads nothing but the id it groups on.
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
