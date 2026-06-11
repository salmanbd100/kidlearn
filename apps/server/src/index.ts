import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "@kidlearn/db";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "kidlearn server" });
});

// Demo route proving the Prisma -> Supabase wiring end-to-end.
app.get("/parents", async (_req: Request, res: Response) => {
  const parents = await prisma.parent.findMany({ include: { children: true } });
  res.json(parents);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
