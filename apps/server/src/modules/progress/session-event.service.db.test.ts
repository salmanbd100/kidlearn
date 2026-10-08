import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import { createChild, createParent } from "../../shared/testing/factories.js";
import {
  assertWithinClientEventBudget,
  CLIENT_EVENTS_PER_MINUTE,
  HEARTBEAT_MIN_INTERVAL_MS,
  recordBeatUnlessRecent,
  recordServerObservedBeat,
} from "./session-event.service.js";

function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

async function seedEvents(
  childId: string,
  type: "lesson_start" | "heartbeat",
  count: number,
  occurredAt: Date,
) {
  await prisma.sessionEvent.createMany({
    data: Array.from({ length: count }, () => ({ childId, type, occurredAt })),
  });
}

describe("recordBeatUnlessRecent against Postgres", () => {
  it("drops a client beat that lands inside the interval of a server-observed one", async () => {
    const child = await createChild((await createParent()).id);

    await recordServerObservedBeat(child.id, "lesson_step");
    const recorded = await recordBeatUnlessRecent(child.id);

    expect(recorded).toBe(false);
    expect(
      await prisma.sessionEvent.findMany({
        where: { childId: child.id },
        select: { type: true, payload: true },
      }),
    ).toEqual([
      {
        type: "heartbeat",
        payload: { source: "server", activity: "lesson_step" },
      },
    ]);
  });

  it("writes again once the interval has passed, with no payload on a client beat", async () => {
    const child = await createChild((await createParent()).id);
    await seedEvents(
      child.id,
      "heartbeat",
      1,
      secondsAgo(HEARTBEAT_MIN_INTERVAL_MS / 1000 + 1),
    );

    expect(await recordBeatUnlessRecent(child.id)).toBe(true);

    const latest = await prisma.sessionEvent.findFirst({
      where: { childId: child.id },
      orderBy: { occurredAt: "desc" },
      select: { payload: true },
    });
    expect(latest?.payload).toBeNull();
  });

  it("throttles each child on its own beats, not a sibling's", async () => {
    const parent = await createParent();
    const child = await createChild(parent.id);
    const sibling = await createChild(parent.id, { firstName: "Rafi" });

    await recordBeatUnlessRecent(sibling.id);

    expect(await recordBeatUnlessRecent(child.id)).toBe(true);
  });
});

describe("assertWithinClientEventBudget against Postgres", () => {
  it("refuses with 429 once a minute's budget of milestones is spent", async () => {
    const child = await createChild((await createParent()).id);
    await seedEvents(
      child.id,
      "lesson_start",
      CLIENT_EVENTS_PER_MINUTE,
      secondsAgo(5),
    );

    await expect(assertWithinClientEventBudget(child.id)).rejects.toMatchObject(
      { statusCode: 429, code: "RATE_LIMITED" },
    );
  });

  it("does not spend the budget on heartbeats or on events older than the window", async () => {
    const child = await createChild((await createParent()).id);
    await seedEvents(
      child.id,
      "heartbeat",
      CLIENT_EVENTS_PER_MINUTE,
      secondsAgo(5),
    );
    await seedEvents(
      child.id,
      "lesson_start",
      CLIENT_EVENTS_PER_MINUTE,
      secondsAgo(61),
    );
    await seedEvents(
      child.id,
      "lesson_start",
      CLIENT_EVENTS_PER_MINUTE - 1,
      secondsAgo(5),
    );

    await expect(
      assertWithinClientEventBudget(child.id),
    ).resolves.toBeUndefined();
  });
});
