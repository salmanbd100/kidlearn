"use client";

import type { AssetKind, Locale, MediaAsset } from "@kidlearn/types";
import { Button, Label, Select } from "@kidlearn/ui";
import Image from "next/image";
import { useMediaPages } from "@/features/admin/use-media-pages";

export interface MediaPickerProps {
  id: string;
  label: string;
  kind: AssetKind;
  /** Narrows to one locale's assets. Omit for language-neutral media. */
  language?: Locale;
  /** The chosen asset's URL, or empty. Matched against the fetched list. */
  value: string;
  onChange: (asset: MediaAsset | undefined) => void;
  isDisabled?: boolean;
  /** Rendered under the control, so a validation issue lands beside its field. */
  error?: string;
}

export function MediaPicker({
  id,
  label,
  kind,
  language,
  value,
  onChange,
  isDisabled,
  error,
}: MediaPickerProps) {
  const { assets, status, hasMore, isLoadingMore, loadMore } = useMediaPages({
    kind,
    ...(language ? { language } : {}),
  });

  const selected = assets.find((asset) => asset.url === value);
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <Select
        id={id}
        value={selected?.id ?? ""}
        disabled={isDisabled || status !== "ready"}
        aria-invalid={error !== undefined}
        aria-describedby={hintId}
        onChange={(event) =>
          onChange(assets.find((asset) => asset.id === event.target.value))
        }
      >
        <option value="">
          {status === "loading" ? "Loading library…" : "Not set"}
        </option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {assetLabel(asset)}
          </option>
        ))}
      </Select>

      {/* A chosen URL the library no longer offers is shown, not silently cleared. */}
      {value !== "" && selected === undefined && status === "ready" ? (
        <p className="text-muted-foreground text-xs">
          {hasMore
            ? "Currently set to an asset not among those loaded — show older files to find it, or pick another: "
            : "Currently set to an asset outside this filter: "}
          <span className="break-all font-mono">{value}</span>
        </p>
      ) : null}

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={isDisabled || isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore ? "Loading…" : "Show older files"}
        </Button>
      ) : null}

      {selected ? <AssetPreview asset={selected} /> : null}

      <p id={hintId} className="text-muted-foreground text-xs">
        {status === "error"
          ? "The media library could not be loaded."
          : `From the media library — ${kind}${language ? `, ${language}` : ""}. Upload new files on the Media page.`}
      </p>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function assetLabel(asset: MediaAsset): string {
  const filename = asset.url.split("/").pop() ?? asset.url;
  const uploaded = new Date(asset.createdAt).toLocaleDateString("en-GB");
  return `${filename} — ${uploaded}`;
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  if (asset.kind === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: an admin preview of a narration clip has no caption track to offer — the clip *is* the caption of the text beside it.
    return <audio className="w-full" controls preload="none" src={asset.url} />;
  }
  if (asset.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: same — captions are authored content this preview exists to check, not something the preview can supply.
      <video
        className="max-h-40 w-full rounded-(--radius) bg-muted"
        controls
        preload="none"
        src={asset.url}
      />
    );
  }
  return (
    <Image
      // Decorative: the filename beside it names the asset.
      alt=""
      src={asset.url}
      width={160}
      height={96}
      unoptimized
      className="max-h-24 w-auto rounded-(--radius) border border-border"
    />
  );
}
