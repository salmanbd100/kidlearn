import { Router } from "express";
import { parentRouter } from "./parent.js";

/**
 * Aggregates every `/api/*` resource router. Later implementation files mount
 * their routers here, e.g.:
 *
 *   apiRouter.use("/children", childrenRouter);
 *
 * Paths under `/api` that match nothing fall through to `notFoundHandler`.
 */
export const apiRouter = Router();

// File 10 — the parent's own account: PIN, consent, deletion. The router
// applies `requireParent` itself, and `requirePinVerified` per route.
apiRouter.use("/parent", parentRouter);
