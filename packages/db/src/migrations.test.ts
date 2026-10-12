import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Locking convention from `backend.md §3`, applied after the last pre-convention migration; the three earlier offenders stay (editing changes the checksum). */

const MIGRATIONS_DIR = new URL("../prisma/migrations/", import.meta.url);
const CONVENTION_STARTS_AFTER = "20260912010000";

function statementsOf(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) => statement.length > 0);
}

function lockingViolations(sql: string): string[] {
  const statements = statementsOf(sql);
  const created = new Set(
    statements.flatMap((statement) => {
      const match = /^CREATE TABLE "(\w+)"/i.exec(statement);
      return match ? [match[1]] : [];
    }),
  );
  const violations: string[] = [];

  for (const statement of statements) {
    const index =
      /^CREATE (?:UNIQUE )?INDEX (CONCURRENTLY )?.*? ON "(\w+)"/i.exec(
        statement,
      );
    if (index !== null) {
      const [, concurrently, table] = index;
      if (concurrently === undefined && !created.has(table)) {
        violations.push(`index on existing "${table}" without CONCURRENTLY`);
      }
      // Postgres runs a multi-statement script as one implicit transaction, and CONCURRENTLY refuses to run inside one.
      if (concurrently !== undefined && statements.length > 1) {
        violations.push("CREATE INDEX CONCURRENTLY shares its migration");
      }
    }

    const foreignKey =
      /^ALTER TABLE "(\w+)" ADD CONSTRAINT .*FOREIGN KEY/i.exec(statement);
    if (
      foreignKey !== null &&
      !created.has(foreignKey[1]) &&
      !/ NOT VALID$/i.test(statement)
    ) {
      violations.push(
        `foreign key on existing "${foreignKey[1]}" without NOT VALID`,
      );
    }
  }

  return violations;
}

function migrationSql(name: string): string {
  return readFileSync(new URL(`${name}/migration.sql`, MIGRATIONS_DIR), "utf8");
}

const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("migration locking convention", () => {
  const governed = migrations.filter(
    (name) => name.slice(0, 14) > CONVENTION_STARTS_AFTER,
  );

  it.each(governed.length > 0 ? governed : ["(none yet)"])(
    "%s takes no long lock on a table with rows",
    (name) => {
      if (name === "(none yet)") return;
      expect(lockingViolations(migrationSql(name))).toEqual([]);
    },
  );
});

describe("lockingViolations", () => {
  it.each([
    "20260822010000_session_event_occurred_at_index",
    "20260911000000_quiz_response_restrict_question_delete",
    "20260912010000_lesson_progress_restrict_delete_and_quiz_response_question_index",
  ])("flags %s, written before the convention", (name) => {
    expect(lockingViolations(migrationSql(name))).not.toEqual([]);
  });

  it("accepts the convention's own shapes", () => {
    expect(
      lockingViolations(
        'CREATE INDEX CONCURRENTLY "QuizResponse_x_idx" ON "QuizResponse"("x");',
      ),
    ).toEqual([]);
    expect(
      lockingViolations(`
        ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_x_fkey"
          FOREIGN KEY ("x") REFERENCES "X"("id") NOT VALID;
        ALTER TABLE "QuizResponse" VALIDATE CONSTRAINT "QuizResponse_x_fkey";
      `),
    ).toEqual([]);
  });

  it("leaves a table created in the same migration alone", () => {
    expect(
      lockingViolations(`
        CREATE TABLE "Fresh" ("id" TEXT NOT NULL, "otherId" TEXT NOT NULL);
        CREATE INDEX "Fresh_otherId_idx" ON "Fresh"("otherId");
        ALTER TABLE "Fresh" ADD CONSTRAINT "Fresh_otherId_fkey"
          FOREIGN KEY ("otherId") REFERENCES "Other"("id");
      `),
    ).toEqual([]);
  });

  it("refuses CONCURRENTLY beside another statement", () => {
    expect(
      lockingViolations(`
        CREATE INDEX CONCURRENTLY "A_x_idx" ON "A"("x");
        CREATE INDEX CONCURRENTLY "A_y_idx" ON "A"("y");
      `),
    ).toContain("CREATE INDEX CONCURRENTLY shares its migration");
  });
});
