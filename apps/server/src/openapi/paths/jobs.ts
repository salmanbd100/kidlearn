import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/** `routes/jobs.ts` — `requireCronSecret` guards the whole router. */
export const JOBS_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/admin/jobs/weekly-reports",
    operation: {
      operationId: "runWeeklyReportsJob",
      tags: ["Jobs"],
      summary: "Generate last week's report for every child",
      description: [
        "Aggregates the most recently **finished** week into a `WeeklyReport` row per child (FR-DASH-05). What an external scheduler calls; there is nothing here a browser needs.",
        "",
        "**Authenticated by a shared secret, not a session.** Send `Authorization: Bearer <CRON_SECRET>`. Deliberately not an admin login: the intended caller is cron-job.org, which has no browser, no cookie jar and nobody to complete an OAuth round trip — a scheduler that cannot authenticate is a scheduler that does not run. The consequence is that the secret is the whole of the authorisation, which is why these routes only ever *recompute* what the server already owns and never read per-child data out.",
        "",
        "**Idempotent, so a retrying scheduler is harmless.** Every write is an upsert on `(childId, weekStart)`, so calling this twice on the same Monday leaves exactly the same rows as calling it once, and the report history can never grow a duplicate week (FR-DASH-06). It does not skip a week that already has a row — re-running replaces the metrics, which is how an event that arrived late still gets counted.",
        "",
        "**Two weeks per child at most: the newest, and the oldest one still missing.** The backfill is what makes a missed Monday recoverable — a scheduler outage or a cold start past its retry budget would otherwise leave a hole in the history that nothing ever filled, because the read path only fills the newest week too. One gap per run keeps the job's cost bounded while making every gap eventually closeable. Neither reaches back past the week a profile was created.",
        "",
        "**One child's failure does not abort the run.** It is logged and skipped: with a backfill in the loop, throwing would let a single unaggregatable child block every later child's gap from ever closing, and next Monday's retry would stop in the same place. `childrenProcessed` counts the children walked, which is what tells an operator an empty database apart from a quiet week.",
        "",
        "**No request body and no `weekStart` parameter.** The week is derived from the server's clock and `APP_TIMEZONE` (Monday 00:00 local). A parameter would let a mis-configured job overwrite an arbitrary historical week, and a scheduler knows nothing about which week it is that the server does not know better.",
        "",
        "`200`, not `202`: the work is finished before it answers. Generation is sequential over children — nothing is waiting on this job, and a burst of parallel aggregations would take the connection pool away from requests that are. Set the scheduler's timeout generously: the free-tier instance cold-starts, which this endpoint tolerates precisely because it has no client waiting.",
        "",
        "The response counts children and names the week. It says nothing about *which* children, on purpose.",
        "",
        "Suggested schedule: every Monday at 02:00 `Asia/Dhaka` — after the week has closed everywhere in the audience, and off-peak.",
      ].join("\n"),
      security: [{ cronSecret: [] }],
      responses: {
        "200": jsonResponse(
          "Every child processed, and the Monday the reports are for.",
          "WeeklyReportJobResponse",
        ),
        "401": errorResponse(
          "The `Authorization` header is missing, is not a `Bearer` token, or does not match `CRON_SECRET`. `401` rather than `403` because there is no identity here for a `403` to be about.",
          ["UNAUTHORIZED"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
