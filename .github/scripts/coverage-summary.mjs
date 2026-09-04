/**
 * Renders each package's `coverage/coverage-summary.json` as one markdown table
 * in the workflow run summary. A number in the run summary gets read; the same
 * number inside a downloadable artifact does not.
 *
 * This is a reporter, never a gate: a missing or unreadable summary is skipped,
 * and the script always exits 0. It runs with `if: always()`, so a failed test
 * step still reports whatever coverage was produced before the failure.
 */
import { appendFileSync, readFileSync } from "node:fs";

const PACKAGES = [
  "apps/web",
  "apps/server",
  "packages/db",
  "packages/types",
  "packages/ui",
];

// v8 reports `pct: "Unknown"` — a string, not a number — when nothing was
// instrumented at all. `packages/db` is legitimately in that state: its suite
// asserts against `schema.prisma` as text and imports nothing from `src/`.
const pct = (metric) =>
  typeof metric?.pct === "number" ? `${metric.pct.toFixed(1)}%` : "—";

const rows = [];
const missing = [];

for (const pkg of PACKAGES) {
  try {
    const { total } = JSON.parse(
      readFileSync(`${pkg}/coverage/coverage-summary.json`, "utf8"),
    );
    if (total.statements?.total === 0) {
      rows.push(`| \`${pkg}\` | _no instrumented files_ | | | |`);
      continue;
    }
    rows.push(
      `| \`${pkg}\` | ${pct(total.statements)} | ${pct(total.branches)} | ${pct(total.functions)} | ${pct(total.lines)} |`,
    );
  } catch {
    missing.push(pkg);
  }
}

const lines = ["## Coverage", ""];

if (rows.length > 0) {
  lines.push(
    "| Package | Statements | Branches | Functions | Lines |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  );
}

if (missing.length > 0) {
  lines.push(
    `No coverage reported for: ${missing.map((p) => `\`${p}\``).join(", ")}`,
    "",
  );
}

lines.push(
  "_Reported, not gated — see `document/standards/general.md §5`. Full HTML reports are in the `coverage` artifact._",
  "",
);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
} else {
  process.stdout.write(`${lines.join("\n")}\n`);
}
