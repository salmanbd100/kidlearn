import { jsonResponse } from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/** `routes/health.ts` — root-mounted, so these two carry no `/api` prefix. */
export const HEALTH_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/",
    operation: {
      tags: ["Health"],
      summary: "Service identity",
      description:
        "Confirms which service is answering. Useful when several deployments share a domain.",
      security: [],
      responses: {
        "200": jsonResponse("The service name.", "ServiceIdentityResponse"),
      },
    },
  },
  {
    method: "get",
    path: "/health",
    operation: {
      tags: ["Health"],
      summary: "Liveness probe",
      description:
        "Reports uptime without touching the database (NFR-PERF-04). Free-tier hosts poll this to keep the instance warm, so it must stay cheap and must not fail when the database is asleep — which also means a `200` here says nothing about database health.",
      security: [],
      responses: {
        "200": jsonResponse(
          "The service is up. `uptime` is process uptime in seconds.",
          "HealthResponse",
        ),
      },
    },
  },
];
