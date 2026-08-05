import { Router } from "express";
import { requireActiveChild } from "../middleware/require-active-child.js";
import { requireParent } from "../middleware/require-parent.js";
import { childrenRouter } from "./children.js";
import { contentRouter } from "./content.js";
import { parentRouter } from "./parent.js";

/**
 * Aggregates every `/api/*` resource router. Later implementation files mount
 * their routers here.
 *
 * Paths under `/api` that match nothing fall through to `notFoundHandler`.
 */
export const apiRouter = Router();

// File 10 — the parent's own account: PIN, consent, deletion. The router
// applies `requireParent` itself, and `requirePinVerified` per route.
apiRouter.use("/parent", parentRouter);

apiRouter.use("/children", childrenRouter);

// Curriculum reads (file 12). The two guards are mounted here rather than
// inside `content.ts` so that every current and future `/api/content/*` path is
// covered by construction — a new route added there cannot forget them.
apiRouter.use("/content", requireParent, requireActiveChild, contentRouter);
