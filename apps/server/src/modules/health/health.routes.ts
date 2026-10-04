import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";

/**
 * Root-mounted probes. `/health` is liveness and deliberately free of database
 * access (NFR-PERF-04): free-tier hosts poll it to keep the instance warm, so it
 * must stay cheap and must not fail when the database is asleep. `/ready` is the
 * opposite probe, for the deploy gate: it fails when the database cannot answer.
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

healthRouter.get("/ready", async (_req, res) => {
  // A real query through the client rather than raw SQL (`backend.md §3`). A
  // failure rejects into the central error handler, which answers `500`.
  await prisma.parent.findFirst({ select: { id: true } });
  const body: SuccessEnvelope<{ status: "ok"; uptime: number }> = {
    data: { status: "ok", uptime: process.uptime() },
  };
  res.json(body);
});
