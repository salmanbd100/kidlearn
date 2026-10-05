import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import type { JobRow, LinkedRow, ReviewWriter } from "./job.js";

/** Why this job cannot be approved right now. */
export async function readBlockers(
  row: JobRow,
  linked: LinkedRow[],
  tx: ReviewWriter,
): Promise<string[]> {
  if (row.status !== "awaiting_review") return [];

  const blockers: string[] = [];

  const moved = linked.filter((one) => one.status !== "draft");
  for (const one of moved) {
    blockers.push(
      `${one.label} is ${one.status}, not draft — it has been changed since this job was generated.`,
    );
  }

  for (const label of await readPlaceholderQuestions(row.id, tx)) {
    blockers.push(
      `${label} still points at a generated placeholder asset that was never replaced.`,
    );
  }

  return blockers;
}

/**
 * Matched on `PLACEHOLDER_ASSET_HOST` rather than `pending://`: the scheme was
 * never viable because `AssetRefSchema.url` requires `https://`, so file 35 uses a
 * reserved `.invalid` host. One spelling, imported from the module that defines it.
 */
async function readPlaceholderQuestions(
  jobId: string,
  tx: ReviewWriter,
): Promise<string[]> {
  const questions = await tx.quizQuestion.findMany({
    where: { aiJobId: jobId },
    select: { id: true, sortOrder: true, definition: true },
    orderBy: { sortOrder: "asc" },
  });

  return questions
    .filter((one) =>
      JSON.stringify(one.definition).includes(PLACEHOLDER_ASSET_HOST),
    )
    .map((one) => `Question ${one.sortOrder}`);
}
