import { Router } from "express";

/**
 * Aggregates every `/api/*` resource router. Later implementation files mount
 * their routers here, e.g.:
 *
 *   apiRouter.use("/children", childrenRouter);
 *
 * Paths under `/api` that match nothing fall through to `notFoundHandler`.
 */
export const apiRouter = Router();
