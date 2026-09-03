import type { Language, MediaKind, Prisma } from "@kidlearn/db";
import { v2 as cloudinary, type UploadApiErrorResponse } from "cloudinary";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

/**
 * The media library (file 33, FR-CMS-02).
 *
 * **No file byte passes through this process.** The browser asks for a signature,
 * posts the file straight to `api.cloudinary.com`, and then tells us the delivery
 * URL it got back. That is not a performance choice: this API runs on a free tier
 * that sleeps and has no disk, so proxying a 40 MB lesson video through it would
 * be a request that times out on a cold start and a memory ceiling nobody can
 * raise.
 *
 * The consequence is that **the client reports the URL**, which is why
 * `registerAsset` re-derives what a legitimate one looks like rather than trusting
 * it. Without that check the endpoint would be a way to write any URL on the
 * internet into a row a five-year-old's lesson later plays.
 *
 * `MediaAsset` rows are never mutated and never deleted here. An asset is
 * referenced by explicit foreign keys from worlds, lessons, stories, badges and
 * characters (files 04–06); rewriting a row's URL would silently change what
 * every one of those plays, and deleting one would break them. Retiring an asset
 * is unlinking it from its owners, which the file-32 endpoints already do.
 *
 * **File 36 adds the one exception to the first paragraph: `uploadBuffer`.** An AI
 * narration clip or illustration has no browser to upload it — it exists only as
 * bytes inside this process — so that path does proxy the file. It is bounded to
 * generated media, tens of kilobytes of mp3 or a single png rather than a 40 MB
 * lesson video, and it is the only shape available: there is nowhere else for
 * those bytes to be.
 */

/**
 * `cloudinary.config` rather than credentials per call.
 *
 * `signUploadParams` hands its secret in explicitly, so the SDK needed no global
 * configuration until `uploadBuffer` arrived — `upload_stream` reads the account
 * from this config and takes no per-call equivalent. Set at import time, so by the
 * time anything calls it a missing credential is impossible: `lib/env.ts` has
 * already refused to boot without one.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/** Where an upload lands, keyed by kind so the console is browsable. */
export function uploadFolderFor(kind: MediaKind): string {
  return `kidlearn/${kind}`;
}

export type UploadSignature = {
  timestamp: number;
  folder: string;
  signature: string;
  apiKey: string;
  cloudName: string;
};

/**
 * The signed parameter set the browser posts to Cloudinary alongside the file.
 *
 * `api_sign_request` is Cloudinary's own implementation of the signing rule
 * (sorted `key=value` pairs, `&`-joined, secret appended, SHA-1) rather than a
 * local copy of it. A hand-rolled version would be a second implementation of a
 * remote service's contract, and a silently wrong signature reads to an admin as
 * "the upload failed" with no way to tell why.
 *
 * Only `timestamp` and `folder` are signed. Cloudinary verifies the signature
 * over exactly the parameters it was computed from, so every field the browser
 * sends must appear here — adding one there without adding it here is what makes
 * an upload fail with `Invalid Signature`.
 *
 * The signature expires (Cloudinary rejects a timestamp more than an hour old),
 * which is what stops one handed out today from being a permanent upload
 * credential.
 */
export function signUploadParams(kind: MediaKind): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = uploadFolderFor(kind);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET,
  );

  return {
    timestamp,
    folder,
    signature,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
  };
}

/**
 * The prefix every delivery URL for this account starts with.
 *
 * Exported so the request schema refines against the same string this module
 * builds, rather than restating the host — see `schemas/admin-media.ts`.
 */
export function deliveryUrlPrefix(): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
}

export function isDeliveryUrl(url: string): boolean {
  return url.startsWith(deliveryUrlPrefix());
}

export type MediaAssetDto = {
  id: string;
  url: string;
  kind: MediaKind;
  /** `null` for a language-neutral asset — an image or an illustration. */
  language: Language | null;
  createdAt: Date;
};

const mediaSelect = {
  id: true,
  url: true,
  kind: true,
  language: true,
  createdAt: true,
} as const;

export function registerAsset(
  input: {
    url: string;
    kind: MediaKind;
    language: Language | null;
    /**
     * The generating job (file 36). Absent for a browser upload, which is the
     * difference between "a person chose this file" and "a model produced it" —
     * file 37's review queue reads it, and its publish guard depends on it.
     */
    aiJobId?: string;
  },
  /**
   * The transaction to write inside, when there is one. `runGenerationJob` calls
   * this from its `persist` step, where the asset row and the job's audit record
   * have to land together or not at all — a row Cloudinary holds bytes for but no
   * job points at is unreviewable, and a job naming an asset that was rolled back
   * is a broken reference in the review queue.
   */
  client: Prisma.TransactionClient = prisma,
): Promise<MediaAssetDto> {
  return client.mediaAsset.create({ data: input, select: mediaSelect });
}

/**
 * The resource type Cloudinary files an upload under.
 *
 * **Audio goes under `video`, and that is Cloudinary's model rather than a
 * mistake**: it has three resource types — `image`, `video`, `raw` — and every
 * time-based medium is a `video` to it, mp3 included. Filing a narration clip as
 * `raw` would store the bytes but give up the transformations and the streaming
 * delivery URL that make it playable.
 */
export type UploadResourceType = "image" | "video";

export function resourceTypeFor(kind: MediaKind): UploadResourceType {
  return kind === "image" ? "image" : "video";
}

/**
 * Uploads bytes this process is holding and resolves with the delivery URL.
 *
 * **The one path where a file transits this API** (see the module header). The AI
 * pipeline has no browser to sign an upload for: the mp3 or the png exists only in
 * memory here, so there is nothing to hand a signature to.
 *
 * `upload_stream` rather than `upload`, because `upload` takes a path or a data
 * URI — the latter would mean base64-encoding the whole buffer into a string,
 * inflating it by a third to send it to the same place.
 *
 * The callback is wrapped rather than awaited through the SDK's promise API
 * because there is not one for the streaming form. A missing `secure_url` on an
 * otherwise successful response is thrown rather than defaulted: what would be
 * stored instead is a `MediaAsset` row pointing at nothing, which is content a
 * child cannot play — the exact failure the file-33 two-step exists to avoid.
 */
export function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; resourceType: UploadResourceType },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: options.folder, resource_type: options.resourceType },
      (error, result) => {
        if (error) {
          reject(asUploadError(error));
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary upload returned no secure_url"));
          return;
        }
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}

/**
 * Cloudinary's failure, as an `Error` that still says what went wrong.
 *
 * `upload_stream` hands its callback a plain `{ message, name, http_code }`
 * object for every API-level failure — only genuine socket errors arrive as an
 * `Error` — so coercing the raw value with `String()` yields the literal
 * `"[object Object]"`. That string is what `runGenerationJob` records as the job's
 * `rawOutput.error`, and it is the whole of the FR-AI-08 diagnosis: a reviewer has
 * to be able to tell a rotated credential (401) from a rate limit (420) from it.
 */
function asUploadError(error: UploadApiErrorResponse): Error {
  if (error instanceof Error) return error;

  const message =
    typeof error.message === "string" && error.message !== ""
      ? error.message
      : JSON.stringify(error);
  const status =
    typeof error.http_code === "number" ? ` (HTTP ${error.http_code})` : "";

  return new Error(`Cloudinary upload failed: ${message}${status}`);
}

/**
 * The library, newest first.
 *
 * Unpaginated, matching the curriculum lists: the picker filters by kind and the
 * grid is browsed by looking at it, so a page boundary would hide an asset that
 * exists. Revisit when the account holds thousands rather than hundreds.
 */
export function listAssets(filters: {
  kind?: MediaKind;
  language?: Language;
}): Promise<MediaAssetDto[]> {
  return prisma.mediaAsset.findMany({
    where: {
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.language ? { language: filters.language } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: mediaSelect,
  });
}
