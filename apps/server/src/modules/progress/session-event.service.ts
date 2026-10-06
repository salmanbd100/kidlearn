import type { Prisma } from "@kidlearn/db";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";

/** Beats closer together than this are dropped. */
export const HEARTBEAT_MIN_INTERVAL_MS = 20_000;

/**
 * Milestone events one child may post per rolling minute across `/api/progress/events` and `/api/events/activity`. A lesson emits
 * seven over several minutes and a story two, so only a scripted client reaches it. A soft cap: the count is not taken under a lock,
 * so a burst of parallel requests can overshoot it by the size of the burst, and the per-IP flood guard bounds that.
 */
export const CLIENT_EVENTS_PER_MINUTE = 30;

const CLIENT_EVENT_WINDOW_MS = 60_000;

/** What the server saw the child do, recorded on the beat it writes so the row can be told apart from a client's. */
export type ServerObservedActivity =
  | "lesson_step"
  | "lesson_complete"
  | "story_complete"
  | "quiz_submit";

/** Writes a `heartbeat` unless one, from either source, landed within `HEARTBEAT_MIN_INTERVAL_MS`; `true` when it wrote. */
export async function recordBeatUnlessRecent(
  childId: string,
  payload?: Prisma.InputJsonObject,
): Promise<boolean> {
  const previous = await prisma.sessionEvent.findFirst({
    where: { childId, type: "heartbeat" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const isTooSoon =
    previous !== null &&
    Date.now() - previous.occurredAt.getTime() < HEARTBEAT_MIN_INTERVAL_MS;
  if (isTooSoon) return false;

  await prisma.sessionEvent.create({
    data: {
      childId,
      type: "heartbeat",
      ...(payload === undefined ? {} : { payload }),
    },
  });
  return true;
}

/**
 * A floor under the minutes a limit is compared against: a client that never sends a heartbeat still has to report steps and
 * completions to progress or be paid, and each of those leaves a server-stamped row. Minutes are derived from timestamps, not
 * counted per row, so a beat beside a client's own adds nothing; it only fills a gap the client left.
 */
export async function recordServerObservedBeat(
  childId: string,
  activity: ServerObservedActivity,
): Promise<void> {
  await recordBeatUnlessRecent(childId, { source: "server", activity });
}

/** Heartbeats are excluded: the client's are throttled on their own and the server's are not the client's to spend. */
export async function assertWithinClientEventBudget(
  childId: string,
): Promise<void> {
  const recent = await prisma.sessionEvent.count({
    where: {
      childId,
      type: { not: "heartbeat" },
      occurredAt: { gte: new Date(Date.now() - CLIENT_EVENT_WINDOW_MS) },
    },
  });
  if (recent >= CLIENT_EVENTS_PER_MINUTE) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many events for this child — try again in a minute",
    );
  }
}
