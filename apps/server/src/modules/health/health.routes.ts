import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";

/**
 * `/health` is liveness and must not touch the database (NFR-PERF-04): free-tier hosts poll it to stay warm.
 * `/ready` is the deploy gate and fails when the database cannot answer.
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
