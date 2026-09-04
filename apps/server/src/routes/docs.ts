import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "../lib/env.js";
import { buildOpenApiDocument } from "../openapi/document.js";

/** Swagger UI and the raw spec. */
export const docsRouter = Router();

/**
 * Built once at module load. The document is derived entirely from static schema
 * definitions, so rebuilding per request would burn CPU to produce identical
 * bytes — and building it here means a malformed registry fails at boot rather
 * than on somebody's first visit to `/docs`.
 */
const document = buildOpenApiDocument({ serverUrl: env.BETTER_AUTH_URL });

/** The raw spec, for client generators, Postman, and `jq`. */
docsRouter.get("/docs.json", (_req, res) => {
  res.json(document);
});

docsRouter.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(document, {
    // `withCredentials` is what makes "Try it out" actually usable. Swagger UI is
    // served from this same origin, which is the origin better-auth sets its
    // session cookie on, so a developer who has signed in through Google can
    // exercise every authenticated endpoint from this page with no token to
    // paste. Without it, fetch omits the cookie and everything answers 401.
    swaggerOptions: {
      withCredentials: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: "list",
      tryItOutEnabled: true,
    },
    customSiteTitle: "kidlearn API",
  }),
);
