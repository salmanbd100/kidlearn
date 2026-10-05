/**
 * Stubs `config/prisma.js` under the stub exception in `general.md §5`. Rule 1 makes idempotency real: `store.reports` is a table
 * and the stubbed `upsert` matches on `(childId, weekStart)`; the unique index itself is asserted in `reports.routes.test.ts`.
 * No session anywhere, deliberately: the endpoint's caller has none.
 */
import { WeeklyReportJobResponseSchema } from "@kidlearn/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../../openapi/assert-contract.js";
import request from "../../shared/testing/request.js";

const OPERATION = "POST /api/admin/jobs/weekly-reports";
const PATH = "/api/admin/jobs/weekly-reports";

/** Matches `vitest.setup.ts`, which is where `env.CRON_SECRET` comes from. */
const SECRET = "test-cron-secret-value";

/** Wednesday midday in Dhaka, so "last completed week" is Monday 10 August. */
const NOW = new Date("2026-08-19T06:00:00.000Z");
const LAST_WEEK = "2026-08-10T00:00:00.000Z";
const WEEK_BEFORE = "2026-08-03T00:00:00.000Z";
const THREE_WEEKS_BACK = "2026-07-27T00:00:00.000Z";

/** Created in the last completed week so there is no older gap to backfill; the backfill tests opt into an older profile. */
const CREATED_LAST_WEEK = new Date("2026-08-10T05:00:00.000Z");

type ReportRow = {
  childId: string;
  weekStart: Date;
  metrics: unknown;
  note: string | null;
  createdAt: Date;
};

type EventRow = { id: string; childId: string; occurredAt: Date };

const store = vi.hoisted(() => ({
  children: [] as { id: string; createdAt: Date }[],
  reports: [] as unknown[],
  events: [] as EventRow[],
}));

const db = vi.hoisted(() => ({
  childFindMany: vi.fn(),
  reportFindMany: vi.fn(),
  reportUpsert: vi.fn(),
  sessionEventFindMany: vi.fn(),
  sessionEventDeleteMany: vi.fn(),
  progressFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
  quizResponseFindMany: vi.fn(),
  storyFindMany: vi.fn(),
  // A per-child read must fail loudly, not return undefined: a job must never grow one.
  parentFindUnique: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findMany: db.childFindMany },
    weeklyReport: { findMany: db.reportFindMany, upsert: db.reportUpsert },
    sessionEvent: {
      findMany: db.sessionEventFindMany,
      deleteMany: db.sessionEventDeleteMany,
    },
    lessonProgress: { findMany: db.progressFindMany },
    rewardLedger: { findMany: db.ledgerFindMany },
    quizResponse: { findMany: db.quizResponseFindMany },
    story: { findMany: db.storyFindMany },
  },
}));

const { app } = await import("../../app.js");

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
  store.events = [];
  for (const fn of Object.values(db)) fn.mockReset();

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  db.childFindMany.mockImplementation(async () => store.children);
  // Interprets the two queries this file sends: a report's per-child window,
  // and retention's "older than the cutoff", in batches.
  db.sessionEventFindMany.mockImplementation(
    async ({
      where,
      take,
    }: {
      where: { childId?: string; occurredAt: { gte?: Date; lt: Date } };
      take?: number;
    }) =>
      store.events
        .filter(
          (row) =>
            (where.childId === undefined || row.childId === where.childId) &&
            (where.occurredAt.gte === undefined ||
              row.occurredAt >= where.occurredAt.gte) &&
            row.occurredAt < where.occurredAt.lt,
        )
        .slice(0, take),
  );
  db.sessionEventDeleteMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) => {
      const doomed = new Set(where.id.in);
      const before = store.events.length;
      store.events = store.events.filter((row) => !doomed.has(row.id));
      return { count: before - store.events.length };
    },
  );
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
    // Length is compared first, so this case exercises `timingSafeEqual` rather than the early return.
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

    // A lowercase scheme (scheduler or proxy) must not yield a 401 indistinguishable from a wrong secret.
    expect(res.status).toBe(200);
  });

  it("does not accept a session cookie in place of the secret", async () => {
    const { auth } = await import("../../config/auth.js");
    // Narrowed: `getSession` returns a deep better-auth type; only the fields the middleware reads are supplied.
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "user_1", email: "parent@example.com" },
      session: { id: "session_1", userId: "user_1" },
    } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);

    const res = await request(app).post(PATH);

    // A signed-in parent is not an authorised scheduler; the credentials are separate schemes.
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
      childrenFailed: 0,
      weekStart: LAST_WEEK,
      sessionEventsPruned: 0,
    });
    expect(store.reports).toHaveLength(3);
  });

  it("is safe to run twice — no week gains a second row", async () => {
    store.children = [child("child_1"), child("child_2")];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);
    const second = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    // Lets a scheduler retry through a cold start without a lock or run log (FR-DASH-06).
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

    // An honest zero, not a 404: an operator reading a cron log must tell "nobody signed up" from a failure.
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
    // One run is one week: a per-child clock read could straddle midnight and write two weeks.
    expect(new Set(weeks)).toEqual(new Set([LAST_WEEK]));
  });

  it("reads no per-child data beyond what it aggregates", async () => {
    store.children = [child("child_1")];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    // The credential is a static secret, so nothing here loads a parent.
    expect(db.parentFindUnique).not.toHaveBeenCalled();
    expect(db.childFindMany.mock.calls[0][0]).toEqual({
      // `createdAt` decides which weeks the child may have a report for.
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

    // Recomputing only the newest week left a missed Monday unrecoverable, as the read path also fills only the newest.
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

    // No completed week yet: a manufactured `quietWeek` before the profile existed is a false record.
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

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    // Aborting would let one unaggregatable child block every later child's gap from closing.
    expect((store.reports as ReportRow[]).map((row) => row.childId)).toEqual([
      "child_2",
    ]);
  });

  it("answers 500 when any child failed, so the scheduler's --fail sees it", async () => {
    // A 200 is what the cron script reports as success; with every child failing, no reports would exist and nobody would hear.
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

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body.error.details).toEqual({
      childrenProcessed: 2,
      childrenFailed: 1,
      weekStart: LAST_WEEK,
      sessionEventsPruned: 0,
    });
    // Says how many, never which: the secret is not a licence to read children.
    expect(res.text).not.toContain("child_1");
  });

  it("joins a run already in flight rather than starting a second pass", async () => {
    // curl's retry after `--max-time` reaches the server mid-run; without this it walked every child twice at once.
    store.children = [child("child_1"), child("child_2")];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.childFindMany.mockImplementation(async () => {
      await gate;
      return store.children;
    });

    const first = request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`)
      .then((res) => res);
    const second = request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`)
      .then((res) => res);
    // Real time, not faked: both requests have to reach the route first.
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const responses = await Promise.all([first, second]);

    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(db.childFindMany).toHaveBeenCalledTimes(1);
    expect(db.reportUpsert).toHaveBeenCalledTimes(2);
  });
});

function weeksWritten(): string[] {
  return (store.reports as ReportRow[])
    .map((row) => row.weekStart.toISOString())
    .sort();
}

describe("POST /api/admin/jobs/weekly-reports — session event retention (R-25)", () => {
  const CUTOFF = new Date("2026-05-21T06:00:00.000Z");

  function event(id: string, occurredAt: Date, childId = "child_1"): EventRow {
    return { id, childId, occurredAt };
  }

  it("deletes events older than 90 days and keeps the rest", async () => {
    store.events = [
      event("old", new Date(CUTOFF.getTime() - 1)),
      event("edge", CUTOFF),
      event("recent", new Date("2026-08-12T04:00:00.000Z")),
    ];

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    assertContract(WeeklyReportJobResponseSchema, res.body, OPERATION);
    expect(res.body.data.sessionEventsPruned).toBe(1);
    expect(store.events.map((row) => row.id)).toEqual(["edge", "recent"]);
  });

  it("works through a backlog in batches rather than one long delete", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    store.events = Array.from({ length: 12_000 }, (_, index) =>
      event(`e${index}`, old),
    );

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.body.data.sessionEventsPruned).toBe(12_000);
    expect(store.events).toHaveLength(0);
    expect(db.sessionEventDeleteMany).toHaveBeenCalledTimes(3);
  });

  it("does not backfill a week whose events have been pruned", async () => {
    // The oldest missing week is in March but its minutes are gone, so a report would say the child never played;
    // the oldest wholly kept week starts Monday 25 May.
    store.children = [child("child_1", new Date("2026-03-02T05:00:00.000Z"))];

    await request(app).post(PATH).set("Authorization", `Bearer ${SECRET}`);

    expect(weeksWritten()).toEqual(["2026-05-25T00:00:00.000Z", LAST_WEEK]);
  });

  it("answers 500 when pruning fails, so a growing table does not go unnoticed", async () => {
    store.events = [event("old", new Date("2026-01-01T00:00:00.000Z"))];
    db.sessionEventDeleteMany.mockRejectedValue(new Error("lock timeout"));

    const res = await request(app)
      .post(PATH)
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
  });
});
