import { errorResponse, jsonResponse } from "../components.js";
import type { RouteDoc } from "../route-doc.js";

// Root-mounted, so these carry no `/api` prefix.
export const HEALTH_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/",
    operation: {
      operationId: "getServiceIdentity",
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
      operationId: "getHealth",
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
  {
    method: "get",
    path: "/ready",
    operation: {
      operationId: "getReadiness",
      tags: ["Health"],
      summary: "Readiness probe",
      description:
        "Runs one trivial database read, so a `200` means the API can reach its database. The deploy gate uses this; `/health` stays database-free for liveness polling and must not be pointed at a monitor that restarts the container when the database is merely asleep.",
      security: [],
      responses: {
        "200": jsonResponse(
          "The service is up and the database answered. `uptime` is process uptime in seconds.",
          "HealthResponse",
        ),
        "500": errorResponse("The database did not answer.", ["INTERNAL"]),
      },
    },
  },
];
