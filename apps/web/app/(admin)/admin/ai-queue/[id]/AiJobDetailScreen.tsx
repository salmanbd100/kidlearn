"use client";

import type { AiJobAsset, AiJobDetail, AiJobEntity } from "@kidlearn/types";
import { Button, cn } from "@kidlearn/ui";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chip, StatusChip } from "@/app/(admin)/admin/curriculum/StatusChip";
import { JsonInspector } from "@/components/admin/JsonInspector";
import { RejectDialog } from "@/components/admin/RejectDialog";
import { approveAiJob, fetchAiJob, rejectAiJob } from "@/lib/admin-api";
import { GRADE_LABELS, LOCALE_LABELS } from "@/lib/admin-labels";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { FOCUS_RING } from "@/lib/focus-ring";
import {
  AI_JOB_STATUS_LABELS,
  AI_JOB_TYPE_LABELS,
  decisionLabel,
  formatRelativeAge,
} from "../job-labels";

/**
 * `/admin/ai-queue/[id]` — read it, then decide (file 37, FR-CMS-05..06,
 * FR-AI-07..08).
 */

export function AiJobDetailScreen({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<AiJobDetail>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [isBusy, setIsBusy] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  /** The rejection's own failure, kept apart from the page's. */
  const [rejectError, setRejectError] = useState<string>();

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const result = await fetchAiJob(jobId);
      if (!isCurrent()) return;

      if (!result.ok) {
        setState("error");
        return;
      }
      setJob(result.data);
      setState("ready");
    },
    [jobId],
  );

  useEffect(() => {
    let isCurrent = true;
    void load(() => isCurrent);
    return () => {
      isCurrent = false;
    };
  }, [load]);

  if (state === "loading") {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (state === "error" || job === undefined) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground text-sm">
          That generation job could not be loaded.
        </p>
        <Button type="button" variant="outline" asChild>
          <Link href={ADMIN_ROUTES.aiQueue}>Back to the queue</Link>
        </Button>
      </div>
    );
  }

  const isDecidable = job.status === "awaiting_review";
  const isBlocked = job.blockers.length > 0;
  const subject = job.entityLabel ?? AI_JOB_TYPE_LABELS[job.type];

  async function handleApprove() {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await approveAiJob(jobId);
    setIsBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      await load();
      return;
    }

    const published = result.data.publishedEntities.length;
    const attached = result.data.attachedAssetIds.length;
    setJob(result.data.job);
    setNotice(
      published > 0
        ? `Published — ${published} ${published === 1 ? "row is" : "rows are"} now live for children.`
        : attached > 0
          ? "Approved — the clip is now attached to its published parent."
          : "Approved.",
    );
  }

  async function handleReject(reason: string) {
    setIsBusy(true);
    setNotice(undefined);
    setRejectError(undefined);

    const result = await rejectAiJob(jobId, reason);
    setIsBusy(false);

    if (!result.ok) {
      setRejectError(result.error.message);
      return;
    }

    setIsRejectOpen(false);
    setJob(result.data.job);
    setNotice(
      "Rejected. The content stays in the database, unreachable to children, with the reason on record.",
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href={ADMIN_ROUTES.aiQueue}
          className={cn(
            "inline-flex min-h-11 items-center rounded-[var(--radius)] text-muted-foreground text-sm hover:text-foreground",
            FOCUS_RING,
          )}
        >
          ← Back to the queue
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-foreground text-xl">{subject}</h1>
          <Chip>{AI_JOB_TYPE_LABELS[job.type]}</Chip>
        </div>

        <p className="text-muted-foreground text-xs">
          {AI_JOB_STATUS_LABELS[job.status]} ·{" "}
          {formatRelativeAge(job.createdAt)}
          {job.gradeLevels.length === 0
            ? null
            : ` · ${job.gradeLevels.map((one) => GRADE_LABELS[one]).join(", ")}`}
          {job.languages.length === 0
            ? null
            : ` · ${job.languages.map((one) => LOCALE_LABELS[one]).join(", ")}`}
        </p>

        {job.decision === null ? null : (
          <p className="text-muted-foreground text-xs">
            Decision: {decisionLabel(job.decision, job.status)}
            {job.reviewedAt === null
              ? null
              : ` · ${formatRelativeAge(job.reviewedAt)}`}
          </p>
        )}

        {job.reviewNote === null ? null : (
          <p className="rounded-[var(--radius)] bg-muted p-3 text-muted-foreground text-sm">
            <span className="font-medium text-foreground">
              Reason for rejection:{" "}
            </span>
            {job.reviewNote}
          </p>
        )}
      </div>

      {notice === undefined ? null : (
        <p className="text-success text-sm" role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {job.assets.length === 0 ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-foreground text-sm">
            {job.type === "image" ? "Illustration" : "Narration"}
          </h2>
          {job.assets.map((asset) => (
            <AssetPreview key={asset.id} asset={asset} />
          ))}
        </section>
      )}

      {job.entities.length === 0 ? null : (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-foreground text-sm">
            What it created
          </h2>
          <ul className="flex flex-col gap-2">
            {job.entities.map((entity) => (
              <li key={`${entity.resource}:${entity.id}`}>
                <EntityRow entity={entity} jobId={jobId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {isBlocked ? (
        <section
          className="flex flex-col gap-1 rounded-[var(--radius)] border border-warning/40 bg-warning/10 p-3"
          role="alert"
        >
          <h2 className="font-medium text-foreground text-sm">
            This cannot be approved yet
          </h2>
          <ul className="list-disc pl-5 text-muted-foreground text-sm">
            {job.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-foreground text-sm">
          What the model was asked, and what it said
        </h2>
        <JsonInspector title="Request (input)" value={job.input} />
        <JsonInspector
          title="Generation record (rawOutput)"
          value={job.rawOutput}
        />
      </section>

      {isDecidable ? (
        <div className="flex flex-wrap gap-2 border-border border-t pt-4">
          <Button
            type="button"
            disabled={isBusy || isBlocked}
            onClick={() => void handleApprove()}
          >
            {isBusy
              ? "Working…"
              : job.decision === "edit_then_approve"
                ? "Publish edited content"
                : "Approve and publish"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isBusy}
            onClick={() => {
              setRejectError(undefined);
              setIsRejectOpen(true);
            }}
          >
            Reject
          </Button>
        </div>
      ) : (
        <p className="border-border border-t pt-4 text-muted-foreground text-sm">
          This job has been decided. Content is moved from here on through the
          curriculum screens.
        </p>
      )}

      <RejectDialog
        isOpen={isRejectOpen}
        onOpenChange={setIsRejectOpen}
        subject={subject}
        isBusy={isBusy}
        error={rejectError}
        onConfirm={(reason) => void handleReject(reason)}
      />
    </div>
  );
}

/** One content row, with the way into the editor that owns it. */
function EntityRow({ entity, jobId }: { entity: AiJobEntity; jobId: string }) {
  const editHref =
    entity.resource === "quizzes"
      ? `${ADMIN_ROUTES.curriculum}/quiz/${entity.id}?jobId=${jobId}`
      : undefined;

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-border bg-card p-3">
      <span className="text-muted-foreground text-xs capitalize">
        {entity.resource.replace(/s$/, "")}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
        {entity.label}
      </span>
      <StatusChip status={entity.status} />
      {editHref === undefined ? null : (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={editHref}>Edit</Link>
        </Button>
      )}
    </div>
  );
}

/** The clip or the picture, playable and viewable before it is approved. */
function AssetPreview({ asset }: { asset: AiJobAsset }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-3">
      <AssetMedia asset={asset} />

      {asset.sourceText === null ? null : (
        <p className="text-muted-foreground text-sm">
          <span className="font-medium text-foreground">
            {asset.kind === "audio" ? "Reading: " : "Drawn from: "}
          </span>
          {asset.sourceText}
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        {asset.language === null
          ? "No language — a picture has none."
          : LOCALE_LABELS[asset.language]}{" "}
        ·{" "}
        {asset.isAttached
          ? "Attached to its parent."
          : asset.targetTable === null
            ? "Not attached — this job recorded no row to attach it to."
            : `Not attached yet — approving writes it to ${asset.targetTable}.`}
      </p>
    </div>
  );
}

function AssetMedia({ asset }: { asset: AiJobAsset }) {
  if (asset.kind === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: the words are rendered beside the player — this clip *is* the narration of them, so a track file would be the same text twice.
    return <audio className="w-full" controls preload="none" src={asset.url} />;
  }
  if (asset.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: no generator produces video; this branch exists so the union is exhaustive rather than to be reached.
      <video
        className="max-h-96 w-full rounded-[var(--radius)] bg-muted"
        controls
        preload="none"
        src={asset.url}
      />
    );
  }
  return (
    <Image
      // The scene brief is what the picture was drawn from, so it is the closest
      // thing to real alternative text this screen has; a reviewer reading it aloud
      // is checking exactly that correspondence.
      alt={asset.sourceText ?? "Generated illustration"}
      src={asset.url}
      width={640}
      height={384}
      unoptimized
      className="max-h-96 w-full rounded-[var(--radius)] border border-border object-contain"
    />
  );
}
