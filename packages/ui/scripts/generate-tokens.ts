import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeTokenRegions } from "../src/styles/render-tokens.js";

const path = fileURLToPath(
  new URL("../src/styles/tokens.css", import.meta.url),
);
writeFileSync(path, writeTokenRegions(readFileSync(path, "utf8")));
// Biome owns the file's layout; the generator owns only the values.
execFileSync("pnpm", ["exec", "biome", "format", "--write", path], {
  stdio: "inherit",
});
