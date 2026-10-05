import { apiReference } from "@scalar/express-api-reference";
import { Router } from "express";
import { env } from "../../config/env.js";
import { buildOpenApiDocument } from "../../openapi/document.js";
import { docsSecurityHeaders } from "../../shared/middleware/security.js";

export const docsRouter = Router();

// Built once at load: the document is static, and a malformed registry should fail at boot,
// not on the first `/docs` visit.
const document = buildOpenApiDocument({ serverUrl: env.BETTER_AUTH_URL });

docsRouter.get("/docs.json", (_req, res) => {
  res.json(document);
});

/**
 * Scalar's **Send** reuses the session cookie because it never sets `credentials` (so `same-origin`)
 * and `/docs` shares an origin with `/api/*`. A `proxyUrl` would make requests cross-origin and break it.
 */
docsRouter.use(
  "/docs",
  docsSecurityHeaders,
  apiReference({
    // `url`, not `content`: the ~730 KB document would otherwise be inlined in every page load.
    url: "/docs.json",
    // The web client calls the API with `fetch`.
    defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
    // Show the models list; it includes the activity/quiz payload contracts.
    hideModels: false,
    // An unrecognised `theme` id silently falls back to `default` (ZodCatch), so a typo shows as wrong colours.
    theme: "purple",
    documentDownloadType: "json",
    persistAuth: true,
    // The name a generated client gives the method.
    showOperationId: true,
    metaData: { title: "kidlearn API" },
  }),
);
