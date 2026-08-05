import { Router } from "express";
import { childrenRouter } from "./children.js";
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
