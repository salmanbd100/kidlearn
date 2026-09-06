import { apiReference } from "@scalar/express-api-reference";
import { Router } from "express";
import { env } from "../lib/env.js";
import { buildOpenApiDocument } from "../openapi/document.js";

/** The API reference and the raw spec. */
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

/**
 * **Send** works off the Google session with no token to paste, and nothing here
 * configures that — it falls out of two defaults lining up.
 *
 * Scalar builds its request as `new Request(url, init)` without ever setting
 * `credentials`, so the request takes the spec default of `same-origin`. This
 * page is served from the same origin as `/api/*`, which is the origin
 * better-auth set the session cookie on, so the browser attaches the httpOnly
 * `better-auth.session_token` itself. Nobody has to set a `Cookie` header, and
 * nothing could: script cannot set that header, which is exactly why this only
 * works while the reference and the API share an origin.
 *
 * Two things would break it, and neither is set: a `proxyUrl` (which would make
 * every request cross-origin — Scalar falls back to an `X-Scalar-Cookie` header
 * for its proxy to translate, and ours would never see a cookie), and serving
 * this page from anywhere but the API's own origin.
 */
docsRouter.use(
  "/docs",
  apiReference({
    // `url`, not `content`: the document is ~730 KB, and inlining it would put
    // all of it in the HTML of every page load. As a URL the browser fetches it
    // once and caches it, and `/docs.json` is a route that already exists.
    url: "/docs.json",
    // The web client calls the API with `fetch`, so the sample a reader copies
    // should be the one they can paste.
    defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
    // 185 schemas, and the activity/quiz payload contracts are among them — the
    // models list is worth browsing here, not hiding.
    hideModels: false,
    // `theme` is a `z.ZodCatch` in Scalar's config schema: an id it does not
    // recognise falls back to `default` silently rather than throwing, so a typo
    // here shows up as the wrong colours, never as an error.
    theme: "purple",
    documentDownloadType: "json",
    persistAuth: true,
    // Every operation carries one, and it is the name a generated client will
    // give the method — so it belongs on screen next to the path.
    showOperationId: true,
    metaData: { title: "kidlearn API" },
  }),
);
