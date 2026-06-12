import { prisma } from "@kidlearn/db";
import cors from "cors";
import express, { type Request, type Response } from "express";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "reachable" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "kidlearn server" });
});
