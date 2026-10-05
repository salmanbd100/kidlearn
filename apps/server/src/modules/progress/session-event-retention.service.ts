import { prisma } from "../../config/prisma.js";

/**
 * How long raw `SessionEvent` rows are kept. A child at play writes a heartbeat
 * every 20–30s, so the table grows for as long as the product is used. Nothing
 * live reads further back than a month (the dashboard's widest window); the
 * weekly report holds each week's aggregates for good. Ninety days leaves the
 * report job about twelve weeks to fill a missed Monday from real events.
 */
export const SESSION_EVENT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Batched so the first run over a long backlog is many short statements, not
 * one long delete holding a connection from a five-connection pool (R-01).
 */
const PRUNE_BATCH_SIZE = 5_000;

/** Events before this instant are gone, or about to be. */
export function sessionEventRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - SESSION_EVENT_RETENTION_DAYS * DAY_MS);
}

/** Deletes events older than the retention window; answers how many went. */
export async function pruneSessionEvents(now = new Date()): Promise<number> {
  const cutoff = sessionEventRetentionCutoff(now);
  let pruned = 0;

  for (;;) {
    const batch = await prisma.sessionEvent.findMany({
      where: { occurredAt: { lt: cutoff } },
      select: { id: true },
      take: PRUNE_BATCH_SIZE,
    });
    if (batch.length === 0) break;

    const { count } = await prisma.sessionEvent.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    pruned += count;

    // A short batch was the last one; a delete that removed nothing would
    // otherwise re-select the same rows forever.
    if (batch.length < PRUNE_BATCH_SIZE || count === 0) break;
  }

  return pruned;
}
