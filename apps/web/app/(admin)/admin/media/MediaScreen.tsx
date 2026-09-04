"use client";

import {
  ASSET_KINDS,
  type AssetKind,
  LOCALES,
  type Locale,
  type MediaAsset,
} from "@kidlearn/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchMediaAssets } from "@/lib/admin-api";
import { AttachDialog } from "./AttachDialog";
import { CharactersTab } from "./CharactersTab";
import { UploadDialog } from "./UploadDialog";

// `/admin/media` — the asset library (file 33, FR-CMS-02).

const KIND_LABELS: Record<AssetKind, string> = {
  image: "Images",
  audio: "Audio",
  video: "Video",
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};

type DialogState =
  | { kind: "closed" }
  | { kind: "upload" }
  | { kind: "attach"; asset: MediaAsset };

type Tab = "library" | "characters";

export function MediaScreen({ videoWorkflow }: { videoWorkflow?: ReactNode }) {
  const [tab, setTab] = useState<Tab>("library");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [kind, setKind] = useState<AssetKind>();
  const [language, setLanguage] = useState<Locale>();
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [notice, setNotice] = useState<string>();
  const [copiedId, setCopiedId] = useState<string>();

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await fetchMediaAssets({
      ...(kind ? { kind } : {}),
      ...(language ? { language } : {}),
    });

    if (!result.ok) {
      setStatus("error");
      return;
    }
    setAssets(result.data);
    setStatus("ready");
  }, [kind, language]);

  useEffect(() => {
    // Only the library tab reads assets; the characters tab holds its own data.
    if (tab === "library") void load();
  }, [load, tab]);

  async function handleCopy(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
    } catch {
      // A denied clipboard permission is not worth an error banner — the URL is
      // on screen and selectable either way.
      setCopiedId(undefined);
    }
  }

  const header = (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-semibold text-foreground text-xl">Media</h1>
          <p className="text-muted-foreground text-xs">
            {tab === "library"
              ? "Files upload straight to Cloudinary — they never pass through the API."
              : "The visual descriptions that keep recurring characters recognisable."}
          </p>
        </div>

        {tab === "library" ? (
          <Button
            type="button"
            onClick={() => {
              setNotice(undefined);
              setDialog({ kind: "upload" });
            }}
          >
            Upload
          </Button>
        ) : null}
      </header>

      <div className="flex gap-2">
        <FilterChip
          isActive={tab === "library"}
          onClick={() => setTab("library")}
        >
          Library
        </FilterChip>
        <FilterChip
          isActive={tab === "characters"}
          onClick={() => setTab("characters")}
        >
          Characters
        </FilterChip>
      </div>
    </div>
  );

  if (tab === "characters") {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <CharactersTab />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <p className="text-muted-foreground text-sm">
          The media library could not be loaded.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="flex flex-wrap gap-2">
        <FilterChip
          isActive={kind === undefined}
          onClick={() => setKind(undefined)}
        >
          All kinds
        </FilterChip>
        {ASSET_KINDS.map((one) => (
          <FilterChip
            key={one}
            isActive={kind === one}
            onClick={() => setKind(one)}
          >
            {KIND_LABELS[one]}
          </FilterChip>
        ))}

        <span aria-hidden="true" className="w-3" />

        <FilterChip
          isActive={language === undefined}
          onClick={() => setLanguage(undefined)}
        >
          Any language
        </FilterChip>
        {LOCALES.map((one) => (
          <FilterChip
            key={one}
            isActive={language === one}
            onClick={() => setLanguage(one)}
          >
            {LANGUAGE_LABELS[one]}
          </FilterChip>
        ))}
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet with those filters.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-3"
            >
              <AssetPreview asset={asset} />

              <p className="break-all font-mono text-muted-foreground text-xs">
                {asset.url.split("/").pop()}
              </p>

              <p className="text-muted-foreground text-xs">
                {asset.kind}
                {asset.language ? ` · ${LANGUAGE_LABELS[asset.language]}` : ""}{" "}
                · {new Date(asset.createdAt).toLocaleDateString("en-GB")}
              </p>

              <div className="mt-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy(asset)}
                >
                  {copiedId === asset.id ? "Copied" : "Copy URL"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNotice(undefined);
                    setDialog({ kind: "attach", asset });
                  }}
                >
                  Attach…
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {videoWorkflow}

      <Dialog
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: "closed" });
        }}
      >
        <DialogContent closeLabel="Close">
          {dialog.kind === "upload" ? (
            <>
              <DialogHeader gutter="inset">
                <DialogTitle>Upload a file</DialogTitle>
                <DialogDescription>
                  The file goes straight to Cloudinary; only its URL is recorded
                  here.
                </DialogDescription>
              </DialogHeader>
              <UploadDialog
                onUploaded={() => {
                  setDialog({ kind: "closed" });
                  setNotice("Uploaded and recorded.");
                  void load();
                }}
              />
            </>
          ) : dialog.kind === "attach" ? (
            <>
              <DialogHeader gutter="inset">
                <DialogTitle>Attach this asset</DialogTitle>
                <DialogDescription>
                  Points a row&rsquo;s media column at this file.
                </DialogDescription>
              </DialogHeader>
              <AttachDialog
                asset={dialog.asset}
                onAttached={(message) => {
                  setDialog({ kind: "closed" });
                  setNotice(message);
                }}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      aria-pressed={isActive}
      variant={isActive ? "default" : "outline"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * Inline preview per kind. The image goes through `next/image` with `unoptimized`
 * — see `components/admin/MediaPicker.tsx` for why the CMS bypasses the optimizer
 * rather than widening the app's remote-image allowlist.
 */
function AssetPreview({ asset }: { asset: MediaAsset }) {
  if (asset.kind === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: an admin preview of a narration clip has no caption track to offer — the clip is what is being checked.
    return <audio className="w-full" controls preload="none" src={asset.url} />;
  }
  if (asset.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: same — captions are authored content this preview exists to check, not something the preview can supply.
      <video
        className="aspect-video w-full rounded-[var(--radius)] bg-muted"
        controls
        preload="none"
        src={asset.url}
      />
    );
  }
  return (
    <Image
      alt=""
      src={asset.url}
      width={320}
      height={180}
      unoptimized
      className="aspect-video w-full rounded-[var(--radius)] border border-border object-contain"
    />
  );
}
