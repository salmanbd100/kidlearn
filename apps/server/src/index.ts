import "dotenv/config";
import { prisma } from "@kidlearn/db";
import type { Request, Response } from "express";
import { app } from "./app.js";

const port = Number(process.env.PORT) || 4000;

// Demo route proving the Prisma -> Supabase wiring end-to-end.
// Left as-is until file 08 restructures routing; removed in file 02.
app.get("/parents", async (_req: Request, res: Response) => {
  const parents = await prisma.parent.findMany({ include: { children: true } });
  res.json(parents);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
