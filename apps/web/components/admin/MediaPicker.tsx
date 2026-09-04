"use client";

import type { AssetKind, Locale, MediaAsset } from "@kidlearn/types";
import { Label, Select } from "@kidlearn/ui";
import Image from "next/image";
import { useEffect, useState } from "react";
import { fetchMediaAssets } from "@/lib/admin-api";

// Choose an asset from the media library, never type a URL (FR-CMS-02).

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
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");

    void fetchMediaAssets({ kind, ...(language ? { language } : {}) }).then(
      (result) => {
        if (!isCurrent) return;
        if (!result.ok) {
          setStatus("error");
          return;
        }
        setAssets(result.data);
        setStatus("ready");
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [kind, language]);

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

      {/* A URL the author has chosen but the library no longer offers — an asset
          filtered out by a locale change, or one deleted behind their back. Shown
          rather than silently cleared, because clearing a field an author filled
          in is worse than telling them it no longer resolves. */}
      {value !== "" && selected === undefined && status === "ready" ? (
        <p className="text-muted-foreground text-xs">
          Currently set to an asset outside this filter:{" "}
          <span className="break-all font-mono">{value}</span>
        </p>
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

/** The tail of the delivery URL, which is the filename an author uploaded. */
function assetLabel(asset: MediaAsset): string {
  const filename = asset.url.split("/").pop() ?? asset.url;
  const uploaded = new Date(asset.createdAt).toLocaleDateString("en-GB");
  return `${filename} — ${uploaded}`;
}

/** Playable or viewable inline, per kind. */
function AssetPreview({ asset }: { asset: MediaAsset }) {
  if (asset.kind === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: an admin preview of a narration clip has no caption track to offer — the clip *is* the caption of the text beside it.
    return <audio className="w-full" controls preload="none" src={asset.url} />;
  }
  if (asset.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: same — captions are authored content this preview exists to check, not something the preview can supply.
      <video
        className="max-h-40 w-full rounded-[var(--radius)] bg-muted"
        controls
        preload="none"
        src={asset.url}
      />
    );
  }
  return (
    <Image
      // Decorative: the filename beside it names the asset, and its real
      // alternative text is authored on whatever payload uses it.
      alt=""
      src={asset.url}
      width={160}
      height={96}
      unoptimized
      className="max-h-24 w-auto rounded-[var(--radius)] border border-border"
    />
  );
}
