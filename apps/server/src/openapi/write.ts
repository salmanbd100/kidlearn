import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "./document.js";

/**
 * Writes the spec to `apps/server/openapi.json` — `pnpm --filter server openapi:write`.
 *
 * The file is gitignored on purpose. It is a derived artifact: committing it would
 * mean a Biome-formatted, merge-conflicting copy of something the server already
 * serves live at `/docs.json`. This script exists for the cases that need a file
 * on disk — importing into Postman, or running a client generator.
 *
 * Note it does **not** import `lib/env.ts`: that module exits the process when
 * `.env` is missing, and generating a document should not require database
 * credentials.
 */
const DEFAULT_SERVER_URL = "http://localhost:4000";

const outputPath = resolve(process.cwd(), "openapi.json");
const document = buildOpenApiDocument({
  serverUrl: process.env.BETTER_AUTH_URL ?? DEFAULT_SERVER_URL,
});

writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);

const operationCount = Object.values(document.paths).reduce(
  (total, pathItem) => total + Object.keys(pathItem).length,
  0,
);
console.log(
  `Wrote ${outputPath} — ${Object.keys(document.paths).length} paths, ${operationCount} operations.`,
);
