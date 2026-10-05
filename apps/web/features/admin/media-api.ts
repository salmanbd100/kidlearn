import type {
  AssetKind,
  Locale,
  MediaAsset,
  UploadSignature,
} from "@kidlearn/types";
import { listQuery } from "@/features/admin/admin-url";
import { type ApiResult, apiFetch } from "@/shared/api/api-client";

const MEDIA_BASE = "/api/admin/media";

/** One page of the library; `before` is the id of the last asset already shown. */
export function fetchMediaAssets(
  filters: {
    kind?: AssetKind;
    language?: Locale;
    limit?: number;
    before?: string;
  } = {},
): Promise<ApiResult<MediaAsset[]>> {
  return apiFetch<MediaAsset[]>(`${MEDIA_BASE}${listQuery(filters)}`);
}

/** `retries: 0`: a replay would issue a second credential for an upload that may already be under way. */
export function signMediaUpload(
  kind: AssetKind,
): Promise<ApiResult<UploadSignature>> {
  return apiFetch<UploadSignature>(`${MEDIA_BASE}/sign`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ kind }),
  });
}

export function registerMediaAsset(input: {
  url: string;
  kind: AssetKind;
  language: Locale | null;
}): Promise<ApiResult<MediaAsset>> {
  return apiFetch<MediaAsset>(MEDIA_BASE, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(input),
  });
}

export function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signature.apiKey);
  form.set("timestamp", String(signature.timestamp));
  form.set("folder", signature.folder);
  form.set("allowed_formats", signature.allowedFormats);
  form.set("signature", signature.signature);

  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`,
    );

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        resolve({
          ok: false,
          message: `Cloudinary refused the upload (${request.status}).`,
        });
        return;
      }
      // External boundary: the URL is re-checked server-side against our delivery host before any row is written.
      const body = JSON.parse(request.responseText) as { secure_url?: unknown };
      if (typeof body.secure_url !== "string") {
        resolve({ ok: false, message: "Cloudinary returned no secure URL." });
        return;
      }
      resolve({ ok: true, url: body.secure_url });
    });

    request.addEventListener("error", () =>
      resolve({ ok: false, message: "The upload could not reach Cloudinary." }),
    );
    request.addEventListener("abort", () =>
      resolve({ ok: false, message: "The upload was cancelled." }),
    );

    request.send(form);
  });
}
