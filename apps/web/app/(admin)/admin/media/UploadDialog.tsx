"use client";

import {
  ASSET_KINDS,
  type AssetKind,
  LOCALES,
  type Locale,
} from "@kidlearn/types";
import {
  Button,
  DialogFooter,
  Label,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuTrigger,
} from "@kidlearn/ui";
import { Upload } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import {
  registerMediaAsset,
  signMediaUpload,
  uploadToCloudinary,
} from "@/features/admin/media-api";
import { optionValue } from "@/features/admin/select-option";

type UploadState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "uploading"; percent: number }
  | { phase: "registering" }
  | { phase: "failed"; message: string };

/** Radix reserves `""` for "no value", so "Not set" needs a value of its own. */
const NO_LANGUAGE = "none";

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
        // Retrying re-uploads the file, so name where it is and let the admin register the URL.
        message: `The file reached Cloudinary but could not be recorded: ${registered.error.message}`,
      });
      return;
    }

    setState({ phase: "idle" });
    setFile(undefined);
    onUploaded();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-kind">Kind</Label>
        <SelectMenu
          value={kind}
          disabled={isBusy}
          onValueChange={(value) => {
            setKind(optionValue(ASSET_KINDS, value, kind));
            setLanguage("");
          }}
        >
          <SelectMenuTrigger id="upload-kind" size="sm" />
          <SelectMenuContent>
            {ASSET_KINDS.map((one) => (
              <SelectMenuItem key={one} value={one}>
                {KIND_LABELS[one]}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
      </div>

      {hasLanguage ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="upload-language">Language</Label>
          <SelectMenu
            value={language === "" ? NO_LANGUAGE : language}
            disabled={isBusy}
            onValueChange={(value) =>
              setLanguage(optionValue(LOCALES, value, ""))
            }
          >
            <SelectMenuTrigger
              id="upload-language"
              size="sm"
              aria-describedby="upload-language-hint"
            />
            <SelectMenuContent>
              <SelectMenuItem value={NO_LANGUAGE}>Not set</SelectMenuItem>
              <SelectMenuSeparator />
              {LOCALES.map((one) => (
                <SelectMenuItem key={one} value={one}>
                  {LANGUAGE_LABELS[one]}
                </SelectMenuItem>
              ))}
            </SelectMenuContent>
          </SelectMenu>
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
          className="min-h-11 rounded-(--radius) border border-input bg-card p-1.5 text-muted-foreground text-sm shadow-xs transition-colors hover:border-ring/60 disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:h-8 file:cursor-pointer file:rounded-(--radius) file:border-0 file:bg-muted file:px-3 file:font-medium file:text-foreground file:text-sm hover:file:bg-accent focus-ring"
        />
      </div>

      <UploadStatus state={state} />

      <DialogFooter className="border-border border-t pt-4">
        <Button
          type="button"
          disabled={file === undefined || isBusy}
          onClick={() => void handleUpload()}
        >
          <Upload aria-hidden="true" className="size-4!" />
          {isBusy ? "Uploading…" : "Upload"}
        </Button>
      </DialogFooter>
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
        // `fetch` can't report upload progress (hence XHR); `transform` only, off the layout path.
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
