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
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { AudioLines, FolderOpen, TriangleAlert, Upload } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useState } from "react";
import { AdminEmptyState } from "@/features/admin/AdminEmptyState";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import { useMediaPages } from "@/features/admin/use-media-pages";
import { AttachDialog } from "./AttachDialog";
import { CharactersTab } from "./CharactersTab";
import { UploadDialog } from "./UploadDialog";

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
  const [kind, setKind] = useState<AssetKind>();
  const [language, setLanguage] = useState<Locale>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [notice, setNotice] = useState<string>();
  const [copiedId, setCopiedId] = useState<string>();

  const {
    assets,
    status,
    hasMore,
    isLoadingMore,
    loadMore,
    reload: load,
  } = useMediaPages(
    { ...(kind ? { kind } : {}), ...(language ? { language } : {}) },
    { isEnabled: tab === "library" },
  );

  async function handleCopy(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
    } catch {
      // A denied clipboard permission isn't worth a banner; the URL is selectable.
      setCopiedId(undefined);
    }
  }

  const header = (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title="Media"
        description={
          tab === "library"
            ? "Files upload straight to Cloudinary — they never pass through the API."
            : "The visual descriptions that keep recurring characters recognisable."
        }
        actions={
          tab === "library" ? (
            <Button
              type="button"
              onClick={() => {
                setNotice(undefined);
                setDialog({ kind: "upload" });
              }}
            >
              <Upload aria-hidden="true" className="size-4!" />
              Upload
            </Button>
          ) : undefined
        }
      />

      <div className="-mt-1 flex gap-1 border-border border-b">
        <TabButton
          isActive={tab === "library"}
          onClick={() => setTab("library")}
        >
          Library
        </TabButton>
        <TabButton
          isActive={tab === "characters"}
          onClick={() => setTab("characters")}
        >
          Characters
        </TabButton>
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
        <AdminEmptyState
          tone="error"
          icon={TriangleAlert}
          title="The media library could not be loaded."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="flex flex-wrap items-center gap-2">
        <AdminFilterChip
          isSelected={kind === undefined}
          onClick={() => setKind(undefined)}
        >
          All kinds
        </AdminFilterChip>
        {ASSET_KINDS.map((one) => (
          <AdminFilterChip
            key={one}
            isSelected={kind === one}
            onClick={() => setKind(one)}
          >
            {KIND_LABELS[one]}
          </AdminFilterChip>
        ))}

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

        <AdminFilterChip
          isSelected={language === undefined}
          onClick={() => setLanguage(undefined)}
        >
          Any language
        </AdminFilterChip>
        {LOCALES.map((one) => (
          <AdminFilterChip
            key={one}
            isSelected={language === one}
            onClick={() => setLanguage(one)}
          >
            {LANGUAGE_LABELS[one]}
          </AdminFilterChip>
        ))}
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-(--radius) border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {status === "loading" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-muted-foreground text-sm">
            Loading…
          </p>
          <ul
            aria-hidden="true"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {[0, 1, 2, 3].map((tile) => (
              <li
                key={tile}
                className="h-64 rounded-(--radius) border border-border bg-card motion-safe:animate-pulse"
              />
            ))}
          </ul>
        </div>
      ) : assets.length === 0 ? (
        <AdminEmptyState
          icon={FolderOpen}
          title="Nothing here yet with those filters."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-col gap-3 rounded-(--radius) border border-border bg-card p-3 shadow-xs"
            >
              <AssetPreview asset={asset} />

              <div className="flex min-w-0 flex-col gap-1">
                <p
                  className="truncate font-mono text-foreground text-xs"
                  title={asset.url.split("/").pop()}
                >
                  {asset.url.split("/").pop()}
                </p>

                <p className="text-muted-foreground text-xs">
                  {KIND_LABELS[asset.kind]}
                  {asset.language
                    ? ` · ${LANGUAGE_LABELS[asset.language]}`
                    : ""}{" "}
                  · {new Date(asset.createdAt).toLocaleDateString("en-GB")}
                </p>
              </div>

              <div className="mt-auto flex gap-2 border-border border-t pt-3">
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

      {status === "ready" && hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore ? "Loading…" : "Show older files"}
        </Button>
      ) : null}

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
                  load();
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

function TabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors",
        "focus-ring",
        isActive
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Images use `next/image` `unoptimized`; see `features/admin/MediaPicker.tsx` for why. */
function AssetPreview({ asset }: { asset: MediaAsset }) {
  if (asset.kind === "audio") {
    return (
      // Same height as an image tile, so a mixed grid lines its filenames up.
      <div className="flex aspect-video w-full flex-col justify-between gap-2 rounded-(--radius) bg-muted p-2">
        <span className="flex flex-1 items-center justify-center text-muted-foreground">
          <AudioLines aria-hidden="true" className="size-8" />
        </span>
        {/* biome-ignore lint/a11y/useMediaCaption: an admin preview of a narration clip has no caption track to offer — the clip is what is being checked. */}
        <audio className="h-9 w-full" controls preload="none" src={asset.url} />
      </div>
    );
  }
  if (asset.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: same — captions are authored content this preview exists to check, not something the preview can supply.
      <video
        className="aspect-video w-full rounded-(--radius) bg-muted"
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
      className="aspect-video w-full rounded-(--radius) border border-border object-contain"
    />
  );
}
