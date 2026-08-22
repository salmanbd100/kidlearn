/**
 * `POST /api/admin/jobs/weekly-reports` — the cron trigger (file 30).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. Rule 1 (stub state, not answers) is what makes the
 * idempotency assertion real: `store.reports` is a table and the stubbed `upsert`
 * matches on `(childId, weekStart)`, so "safe to re-run" is a row count rather than
 * a mock told to return the same thing twice. Rule 4's half of the same guarantee —
 * the unique index itself — is asserted in `reports.test.ts`.
 *
 * There is no session anywhere in this file, deliberately: the whole point of the
 * endpoint is that its caller has none.
 */
import { WeeklyReportJobResponseSchema } from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const OPERATION = "POST /api/admin/jobs/weekly-reports";
const PATH = "/api/admin/jobs/weekly-reports";

/** Matches `vitest.setup.ts`, which is where `env.CRON_SECRET` comes from. */
const SECRET = "test-cron-secret-value";

/** Wednesday midday in Dhaka, so "last completed week" is Monday 10 August. */
const NOW = new Date("2026-08-19T06:00:00.000Z");
const LAST_WEEK = "2026-08-10T00:00:00.000Z";
const WEEK_BEFORE = "2026-08-03T00:00:00.000Z";
const THREE_WEEKS_BACK = "2026-07-27T00:00:00.000Z";

/**
 * Created inside the last completed week, so `firstReportableWeek` and the week the
 * job regenerates are the same one and there is no older gap to backfill. The
 * backfill tests below opt into an older profile explicitly.
 */
const CREATED_LAST_WEEK = new Date("2026-08-10T05:00:00.000Z");

type ReportRow = {
  childId: string;
  weekStart: Date;
  metrics: unknown;
  note: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  children: [] as { id: string; createdAt: Date }[],
  reports: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  childFindMany: vi.fn(),
  reportFindMany: vi.fn(),
  reportUpsert: vi.fn(),
  sessionEventFindMany: vi.fn(),
  progressFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
  quizResponseFindMany: vi.fn(),
  storyFindMany: vi.fn(),
  // Present so an accidental read of one of these fails loudly rather than
  // silently returning undefined: a job must never grow a per-child read.
  parentFindUnique: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findMany: db.childFindMany },
    weeklyReport: { findMany: db.reportFindMany, upsert: db.reportUpsert },
    sessionEvent: { findMany: db.sessionEventFindMany },
    lessonProgress: { findMany: db.progressFindMany },
    rewardLedger: { findMany: db.ledgerFindMany },
    quizResponse: { findMany: db.quizResponseFindMany },
    story: { findMany: db.storyFindMany },
  },
}));

const { app } = await import("../app.js");

function child(id: string, createdAt = CREATED_LAST_WEEK) {
  return { id, createdAt };
}

function storedReport(childId: string, weekStart: string): ReportRow {
  return {
    childId,
    weekStart: new Date(weekStart),
    metrics: {},
    note: null,
    createdAt: new Date("2026-08-17T02:00:00.000Z"),
  };
}

beforeEach(() => {
  store.children = [];
  store.reports = [];
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);

  db.childFindMany.mockImplementation(async () => store.children);
  db.sessionEventFindMany.mockResolvedValue([]);
  db.progressFindMany.mockResolvedValue([]);
  db.ledgerFindMany.mockResolvedValue([]);
  db.quizResponseFindMany.mockResolvedValue([]);
  db.storyFindMany.mockResolvedValue([]);

  db.reportFindMany.mockImplementation(
    async ({ where }: { where: { childId: string } }) =>
      (store.reports as ReportRow[]).filter(
        (row) => row.childId === where.childId,
      ),
  );

  db.reportUpsert.mockImplementation(
    async (args: {
      where: { childId_weekStart: { childId: string; weekStart: Date } };
      create: ReportRow;
      update: { metrics: unknown; note: string | null };
    }) => {
      const { childId, weekStart } = args.where.childId_weekStart;
      const rows = store.reports as ReportRow[];
      const existing = rows.find(
        (row) =>
          row.childId === childId &&
          row.weekStart.getTime() === weekStart.getTime(),
      );

      if (existing) {
        existing.metrics = args.update.metrics;
        existing.note = args.update.note;
        return existing;
      }

      const created: ReportRow = {
        childId,
        weekStart,
        metrics: args.create.metrics,
        note: args.create.note,
        createdAt: new Date(),
      };
      rows.push(created);
      return created;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/admin/jobs/weekly-reports — the secret", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).post(PATH);

    // 401, not 403: there is no identity here for a 403 to be about.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(db.childFindMany).not.toHaveBeenCalled();
  });

  it("returns 401 for the wrong secret", async () => {
    const res = await request(app)
      .post(PATH)
      .set("Authorization", "Bearer not-the-secret-at-all");

    expect(res.status).toBe(401);
    expect(db.reportUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 for a secret with the right length but wrong bytes", async () => {
    // The comparison is constant-time and length is compared first, so this is the
    // case that actually exercises `timingSafeEqual` rather than the early return.
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${wrong}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret is sent without the Bearer scheme", async () => {
    const res = await request(app).post(PATH).set("Authorization", SECRET);

    expect(res.status).toBe(401);
  });

  it("accepts the scheme in any case, as RFC 7235 requires", async () => {
    const res = await request(app)
      .post(PATH)
      .set("Authorization", `bearer ${SECRET}`);

    // A scheduler configured with a lowercase scheme — or a proxy that normalises
    // it — must not get a 401 indistinguishable from a wrong secret.
    expect(res.status).toBe(200);
  });

  it("does not accept a session cookie in place of the secret", async () => {
    const { auth } = await import("../lib/auth.js");
    // `getSession` returns a deep better-auth type; only the fields the middleware
    // reads are supplied, so the shape is narrowed at this boundary.
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "user_1", email: "parent@example.com" },
      session: { id: "session_1", userId: "user_1" },
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);

    const res = await request(app).post(PATH);

    // A signed-in parent is not an authorised scheduler. The two credentials are
    // separate schemes in the document for exactly this reason.
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/jobs/weekly-reports — generation", () => {
  it("generates last week for every child", async () => {
    store.children = [child("child_1"), child("child_2"), child("child_3")];

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    assertContract(WeeklyReportJobResponseSchema, res.body, OPERATION);
    expect(res.body.data).toEqual({
      childrenProcessed: 3,
      weekStart: LAST_WEEK,
    });
    expect(store.reports).toHaveLength(3);
  });

  it("is safe to run twice — no week gains a second row", async () => {
    store.children = [child("child_1"), child("child_2")];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);
    const second = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    // What lets a scheduler retry through a cold start without a lock or a run
    // log (FR-DASH-06).
    expect(second.status).toBe(200);
    expect(second.body.data.childrenProcessed).toBe(2);
    expect(store.reports).toHaveLength(2);
    // Re-run rather than skip: an event that arrived late still gets counted.
    expect(db.reportUpsert).toHaveBeenCalledTimes(4);
  });

  it("reports zero for a deployment with no children yet", async () => {
    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    // An honest zero rather than a 404: "nobody has signed up" is not a missing
    // resource, and an operator reading a cron log needs to tell it from a failure.
    expect(res.status).toBe(200);
    assertContract(WeeklyReportJobResponseSchema, res.body, OPERATION);
    expect(res.body.data.childrenProcessed).toBe(0);
    expect(db.reportUpsert).not.toHaveBeenCalled();
  });

  it("asks for the same Monday for every child", async () => {
    store.children = [child("child_1"), child("child_2")];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    const weeks = db.reportUpsert.mock.calls.map((call) =>
      call[0].where.childId_weekStart.weekStart.toISOString(),
    );
    // One run is one week. A per-child clock read could straddle midnight and
    // write two different weeks from a single job.
    expect(new Set(weeks)).toEqual(new Set([LAST_WEEK]));
  });

  it("reads no per-child data beyond what it aggregates", async () => {
    store.children = [child("child_1")];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    // The credential is a static secret in a third party's config field, so there
    // is no human for a response to be scoped to. Nothing here loads a parent.
    expect(db.parentFindUnique).not.toHaveBeenCalled();
    expect(db.childFindMany.mock.calls[0][0]).toEqual({
      // `createdAt` decides which weeks the child may have a report for at all;
      // still nothing about who they are.
      select: { id: true, createdAt: true },
    });
  });
});

describe("POST /api/admin/jobs/weekly-reports — closing older gaps", () => {
  /** Created on the Monday of 20 July, so 20 Jul, 27 Jul and 3 Aug are all owed. */
  const OLDER = new Date("2026-07-20T05:00:00.000Z");

  it("fills the oldest missing week as well as the newest, one per run", async () => {
    store.children = [child("child_1", OLDER)];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    // The half that was documented and missing: recomputing only the newest week
    // left a missed Monday unrecoverable, because the read path only fills the
    // newest week too.
    expect(weeksWritten()).toEqual(
      ["2026-07-20T00:00:00.000Z", LAST_WEEK].sort(),
    );
  });

  it("walks forwards a week at a time until the history is complete", async () => {
    store.children = [child("child_1", OLDER)];

    for (let run = 0; run < 3; run += 1) {
      await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);
    }

    expect(weeksWritten()).toEqual(
      [
        THREE_WEEKS_BACK,
        WEEK_BEFORE,
        "2026-07-20T00:00:00.000Z",
        LAST_WEEK,
      ].sort(),
    );
  });

  it("stops backfilling once nothing is missing", async () => {
    store.children = [child("child_1", OLDER)];
    store.reports = [
      storedReport("child_1", "2026-07-20T00:00:00.000Z"),
      storedReport("child_1", THREE_WEEKS_BACK),
      storedReport("child_1", WEEK_BEFORE),
    ];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    // One upsert, the newest week — a complete history costs the run nothing extra.
    expect(db.reportUpsert).toHaveBeenCalledTimes(1);
    expect(weeksWritten()).toEqual(
      [
        "2026-07-20T00:00:00.000Z",
        THREE_WEEKS_BACK,
        WEEK_BEFORE,
        LAST_WEEK,
      ].sort(),
    );
  });

  it("writes nothing for a child created after the week ended", async () => {
    store.children = [child("child_1", new Date("2026-08-19T05:00:00.000Z"))];

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    // A profile made on Wednesday has no completed week yet, and a manufactured
    // `quietWeek` for a week before it existed is a false record, not an empty one.
    expect(db.reportUpsert).not.toHaveBeenCalled();
    // Still counted as walked, so an operator can tell this from an empty database.
    expect(res.body.data.childrenProcessed).toBe(1);
  });

  it("keeps going when one child cannot be aggregated", async () => {
    store.children = [child("child_1"), child("child_2")];
    db.sessionEventFindMany.mockImplementation(
      async ({ where }: { where: { childId: string } }) => {
        if (where.childId === "child_1") throw new Error("pool exhausted");
        return [];
      },
    );

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    // Aborting the run would let one unaggregatable child block every later
    // child's gap from ever closing — next Monday's retry stops in the same place.
    expect(res.status).toBe(200);
    expect((store.reports as ReportRow[]).map((row) => row.childId)).toEqual([
      "child_2",
    ]);
  });
});

function weeksWritten(): string[] {
  return (store.reports as ReportRow[])
    .map((row) => row.weekStart.toISOString())
    .sort();
}
