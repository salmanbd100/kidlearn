import type { Language, MediaKind } from "@kidlearn/db";
import { v2 as cloudinary } from "cloudinary";
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
 */

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

export function registerAsset(input: {
  url: string;
  kind: MediaKind;
  language: Language | null;
}): Promise<MediaAssetDto> {
  return prisma.mediaAsset.create({ data: input, select: mediaSelect });
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
