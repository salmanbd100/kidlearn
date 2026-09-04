"use client";

import {
  ASSET_KINDS,
  type AssetKind,
  LOCALES,
  type Locale,
} from "@kidlearn/types";
import { Button, Label, Select } from "@kidlearn/ui";
import { type ChangeEvent, useState } from "react";
import {
  registerMediaAsset,
  signMediaUpload,
  uploadToCloudinary,
} from "@/lib/admin-api";
import { optionValue } from "@/lib/select-option";

// Sign → upload → register, as one form (FR-CMS-02).

type UploadState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "uploading"; percent: number }
  | { phase: "registering" }
  | { phase: "failed"; message: string };

const KIND_LABELS: Record<AssetKind, string> = {
  image: "Image",
  audio: "Audio",
  video: "Video",
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};

export function UploadDialog({
  onUploaded,
}: {
  /** Fired once a `MediaAsset` row exists, so the grid can re-read. */
  onUploaded: () => void;
}) {
  const [kind, setKind] = useState<AssetKind>("image");
  const [language, setLanguage] = useState<Locale | "">("");
  const [file, setFile] = useState<File>();
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const isBusy = state.phase !== "idle" && state.phase !== "failed";
  const hasLanguage = kind !== "image";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setState({ phase: "idle" });
    setFile(event.target.files?.[0]);
  }

  async function handleUpload() {
    if (file === undefined) return;

    setState({ phase: "signing" });
    const signature = await signMediaUpload(kind);
    if (!signature.ok) {
      setState({ phase: "failed", message: signature.error.message });
      return;
    }

    setState({ phase: "uploading", percent: 0 });
    const uploaded = await uploadToCloudinary(file, signature.data, (percent) =>
      setState({ phase: "uploading", percent }),
    );
    if (!uploaded.ok) {
      setState({ phase: "failed", message: uploaded.message });
      return;
    }

    setState({ phase: "registering" });
    const registered = await registerMediaAsset({
      url: uploaded.url,
      kind,
      language: hasLanguage && language !== "" ? language : null,
    });
    if (!registered.ok) {
      setState({
        phase: "failed",
        // Naming the file's whereabouts matters: retrying uploads it again, so
        // the useful action is to register the URL rather than repeat the upload.
        message: `The file reached Cloudinary but could not be recorded: ${registered.error.message}`,
      });
      return;
    }

    setState({ phase: "idle" });
    setFile(undefined);
    onUploaded();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-kind">Kind</Label>
        <Select
          id="upload-kind"
          value={kind}
          disabled={isBusy}
          onChange={(event) => {
            setKind(optionValue(ASSET_KINDS, event.target.value, kind));
            setLanguage("");
          }}
        >
          {ASSET_KINDS.map((one) => (
            <option key={one} value={one}>
              {KIND_LABELS[one]}
            </option>
          ))}
        </Select>
      </div>

      {hasLanguage ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="upload-language">Language</Label>
          <Select
            id="upload-language"
            value={language}
            disabled={isBusy}
            aria-describedby="upload-language-hint"
            onChange={(event) =>
              setLanguage(optionValue(LOCALES, event.target.value, ""))
            }
          >
            <option value="">Not set</option>
            {LOCALES.map((one) => (
              <option key={one} value={one}>
                {LANGUAGE_LABELS[one]}
              </option>
            ))}
          </Select>
          <p
            id="upload-language-hint"
            className="text-muted-foreground text-xs"
          >
            Which locale this recording is for. Getting it wrong is how a Bangla
            learner hears English.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-file">File</Label>
        <input
          id="upload-file"
          type="file"
          disabled={isBusy}
          accept={`${kind}/*`}
          onChange={handleFileChange}
          className="rounded-[var(--radius)] border-2 border-input bg-card p-2 text-foreground text-sm file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-foreground file:text-sm"
        />
      </div>

      <UploadStatus state={state} />

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={file === undefined || isBusy}
          onClick={() => void handleUpload()}
        >
          {isBusy ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

function UploadStatus({ state }: { state: UploadState }) {
  if (state.phase === "idle") return null;

  if (state.phase === "failed") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {state.message}
      </p>
    );
  }

  const message =
    state.phase === "signing"
      ? "Asking for an upload signature…"
      : state.phase === "registering"
        ? "Recording the asset…"
        : `Uploading to Cloudinary — ${state.percent}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <p role="status" className="text-muted-foreground text-sm">
        {message}
      </p>
      {state.phase === "uploading" ? (
        // A real bar rather than a spinner: `fetch` cannot report upload progress,
        // which is why `uploadToCloudinary` uses XHR. `transform` only, so the
        // animation stays off the layout path (design.md §5).
        <div className="h-1.5 overflow-hidden rounded-pill bg-muted">
          <div
            className="h-full origin-left bg-primary transition-transform"
            style={{ transform: `scaleX(${state.percent / 100})` }}
          />
        </div>
      ) : null}
    </div>
  );
}
