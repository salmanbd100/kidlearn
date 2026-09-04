import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "./document.js";

/**
 * Writes the spec to `apps/server/openapi.json` — `pnpm --filter server openapi:write`.
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
