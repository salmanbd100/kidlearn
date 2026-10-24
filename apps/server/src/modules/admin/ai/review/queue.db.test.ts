import { describe, expect, it } from "vitest";
import { prisma } from "../../../../config/prisma.js";
import { createAdmin } from "../../../../shared/testing/factories.js";
import { getJob, listJobs } from "./queue.js";

const LIST = { status: "awaiting_review", take: 25, skip: 0 } as const;

describe("job provenance in the review queue (FR-AI-08, FR-AI-10)", () => {
  it("labels an MCP draft with its source, requesting admin and self-reported client", async () => {
    const admin = await createAdmin({ name: "Ayesha" });
    const job = await prisma.aIGenerationJob.create({
      data: {
        type: "lesson",
        source: "mcp",
        status: "awaiting_review",
        input: {},
        requestedById: admin.id,
        client: { name: "claude-code", version: "2.1.0", extra: { nested: 1 } },
      },
    });

    const list = await listJobs(LIST);
    const detail = await getJob(job.id);

    for (const view of [list.jobs[0], detail]) {
      expect(view).toMatchObject({
        source: "mcp",
        requestedBy: "Ayesha",
        client: { name: "claude-code", version: "2.1.0" },
      });
    }
  });

  it("labels a Gemini job written before requesters were recorded", async () => {
    await prisma.aIGenerationJob.create({
      data: { type: "story", status: "awaiting_review", input: {} },
    });

    const list = await listJobs(LIST);

    expect(list.jobs[0]).toMatchObject({
      source: "gemini",
      requestedBy: null,
      client: null,
    });
  });

  it("keeps the job when its requesting admin is removed", async () => {
    const admin = await createAdmin();
    const job = await prisma.aIGenerationJob.create({
      data: {
        type: "quiz",
        source: "mcp",
        status: "awaiting_review",
        input: {},
        requestedById: admin.id,
      },
    });

    await prisma.adminUser.delete({ where: { id: admin.id } });

    expect(await getJob(job.id)).toMatchObject({ requestedBy: null });
  });
});
