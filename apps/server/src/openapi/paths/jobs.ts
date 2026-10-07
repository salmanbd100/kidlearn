import { errorResponse, jsonResponse } from "../components.js";
import type { RouteDoc } from "../route-doc.js";

// `requireCronSecret` guards the whole router.
export const JOBS_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/admin/jobs/weekly-reports",
    operation: {
      operationId: "runWeeklyReportsJob",
      tags: ["Jobs"],
      summary: "Start generating last week's report for every child",
      description: [
        "Aggregates the most recently **finished** week into a `WeeklyReport` row per child (FR-DASH-05). What an external scheduler calls; there is nothing here a browser needs.",
        "",
        "**Authenticated by a shared secret, not a session.** Send `Authorization: Bearer <CRON_SECRET>`. Deliberately not an admin login: the intended caller is cron-job.org, which has no browser, no cookie jar and nobody to complete an OAuth round trip — a scheduler that cannot authenticate is a scheduler that does not run. The consequence is that the secret is the whole of the authorisation, which is why these routes only ever *recompute* what the server already owns and never read per-child data out.",
        "",
        '**Idempotent, so a retrying scheduler is harmless.** Every write is an upsert on `(childId, weekStart)`, so calling this twice on the same Monday leaves exactly the same rows as calling it once, and the report history can never grow a duplicate week (FR-DASH-06). A call that arrives while a run is still in flight — a scheduler retrying — joins that run (`status: "alreadyRunning"`, with that run\'s `startedAt`) rather than walking every child a second time alongside it. It does not skip a week that already has a row — re-running replaces the metrics, which is how an event that arrived late still gets counted.',
        "",
        "**Two weeks per child at most: the newest, and the oldest one still missing.** The backfill is what makes a missed Monday recoverable — a scheduler outage or a cold start past its retry budget would otherwise leave a hole in the history that nothing ever filled, because the read path only fills the newest week too. One gap per run keeps the job's cost bounded while making every gap eventually closeable. Neither reaches back past the week a profile was created, nor past the oldest week whose events are still kept — a report for a week whose minutes were pruned would tell the parent the child did not play.",
        "",
        "**Then prunes raw session events older than 90 days** (`sessionEventsPruned`). Heartbeats arrive every 20–30s while a child plays; nothing live reads further back than a month, and each week's aggregate survives in its `WeeklyReport`. Pruning runs after the reports, in batches, so the week just reported is read before anything is deleted.",
        "",
        "**One child's failure does not abort the run.** It is logged and skipped: with a backfill in the loop, throwing would let a single unaggregatable child block every later child's gap from ever closing, and next Monday's retry would stop in the same place. Children are read in pages of 200, by id, so the run's memory does not grow with the user base.",
        "",
        "**The outcome is in the server log, not the response.** The run ends with one log line carrying `{ childrenProcessed, childrenFailed, weekStart, sessionEventsPruned }` — at `error` level when any child failed or the run threw, at `info` otherwise. `childrenProcessed` counts the children walked, which is what tells an operator an empty database apart from a quiet week.",
        "",
        "**No request body and no `weekStart` parameter.** The week is derived from the server's clock and `APP_TIMEZONE` (Monday 00:00 local). A parameter would let a mis-configured job overwrite an arbitrary historical week, and a scheduler knows nothing about which week it is that the server does not know better.",
        "",
        "`202`, not `200`: the run is started, not finished, when this answers. A pass over every child outlasts a scheduler's request timeout well before the user base is large, and a timed-out call reads as a failure even when the run completes. Generation stays sequential over children in the background — a burst of parallel aggregations would take the connection pool away from requests that someone is waiting on.",
        "",
        "The response names no child, on purpose; neither does the summary log line.",
        "",
        "Suggested schedule: every Monday at 02:00 `Asia/Dhaka` — after the week has closed everywhere in the audience, and off-peak.",
      ].join("\n"),
      security: [{ cronSecret: [] }],
      responses: {
        "202": jsonResponse(
          "The run is under way — started by this call, or already in flight and joined.",
          "WeeklyReportJobAcceptedResponse",
        ),
        "401": errorResponse(
          "The `Authorization` header is missing, is not a `Bearer` token, or does not match `CRON_SECRET`. `401` rather than `403` because there is no identity here for a `403` to be about.",
          ["UNAUTHORIZED"],
        ),
      },
    },
  },
];
