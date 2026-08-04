import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";

/**
 * Root-mounted liveness endpoints. Deliberately free of database access
 * (NFR-PERF-04): free-tier hosts poll `/health` to keep the instance warm, so
 * it must stay cheap and must not fail when the database is asleep.
 */
export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const body: SuccessEnvelope<{ name: string }> = {
    data: { name: "kidlearn-api" },
  };
  res.json(body);
});

healthRouter.get("/health", (_req, res) => {
  const body: SuccessEnvelope<{ status: "ok"; uptime: number }> = {
    data: { status: "ok", uptime: process.uptime() },
  };
  res.json(body);
});
