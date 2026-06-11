import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";

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

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
