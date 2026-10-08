import { prisma } from "../../config/prisma.js";

/**
 * Raw `SessionEvent` rows grow with every heartbeat; nothing live reads past a month and the weekly report keeps aggregates for good.
 * 90 days leaves the report job about twelve weeks to fill a missed Monday from real events.
 */
export const SESSION_EVENT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Batched so a long backlog is many short statements, not one long delete holding a connection from a five-connection pool. */
const PRUNE_BATCH_SIZE = 5_000;

export function sessionEventRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - SESSION_EVENT_RETENTION_DAYS * DAY_MS);
}

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
