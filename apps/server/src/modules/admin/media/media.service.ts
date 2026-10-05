import type { Language, MediaKind, Prisma } from "@kidlearn/db";
import { v2 as cloudinary, type UploadApiErrorResponse } from "cloudinary";
import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";

// The media library (file 33, FR-CMS-02).

/** `cloudinary.config` rather than credentials per call. */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/** Where an upload lands, keyed by kind so the console is browsable. */
export function uploadFolderFor(kind: MediaKind): string {
  return `kidlearn/${kind}`;
}

/**
 * What Cloudinary will accept under a signature, per kind. Signed, so the browser
 * cannot widen it: without it, one image credential could put an HTML page or a
 * scripted SVG on our delivery host for the length of the signature's life. SVG is
 * left out of `image` for that reason, not by oversight.
 */
export const ALLOWED_UPLOAD_FORMATS: Record<MediaKind, string> = {
  image: "png,jpg,jpeg,webp,gif",
  audio: "mp3,m4a,aac,wav,ogg",
  video: "mp4,webm,mov",
};

export type UploadSignature = {
  timestamp: number;
  folder: string;
  allowedFormats: string;
  signature: string;
  apiKey: string;
  cloudName: string;
};

/**
 * The signed parameter set the browser posts to Cloudinary alongside the file.
 * Every signed parameter has to be posted back exactly, or Cloudinary refuses the
 * upload — so the browser is handed each one rather than left to rebuild it.
 */
export function signUploadParams(kind: MediaKind): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = uploadFolderFor(kind);
  const allowedFormats = ALLOWED_UPLOAD_FORMATS[kind];
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, allowed_formats: allowedFormats },
    env.CLOUDINARY_API_SECRET,
  );

  return {
    timestamp,
    folder,
    allowedFormats,
    signature,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
  };
}

/** The prefix every delivery URL for this account starts with. */
export function deliveryUrlPrefix(): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
}

/**
 * A prefix test alone is not enough: `<cloud>/../other-cloud/x.png` starts with
 * our prefix as written, but the browser normalises it onto another cloud's
 * path before it fetches. So the URL is parsed, and a dot segment — raw or
 * percent-encoded — is refused outright.
 */
export function isDeliveryUrl(url: string): boolean {
  if (!url.startsWith(deliveryUrlPrefix())) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!parsed.href.startsWith(deliveryUrlPrefix())) return false;
  if (parsed.username !== "" || parsed.password !== "") return false;

  try {
    return !parsed.pathname.split("/").some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === "..";
    });
  } catch {
    // A malformed percent escape is not a URL Cloudinary would have issued.
    return false;
  }
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

/** The resource type Cloudinary files an upload under. */
export type UploadResourceType = "image" | "video";

export function resourceTypeFor(kind: MediaKind): UploadResourceType {
  return kind === "image" ? "image" : "video";
}

/** Uploads bytes this process is holding and resolves with the delivery URL. */
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

/** Cloudinary's failure, as an `Error` that still says what went wrong. */
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
 * One page of the library, newest first. `id` breaks a `createdAt` tie, so a
 * batch of assets one generation job registered in the same millisecond still
 * pages without repeating or skipping one.
 */
export function listAssets(filters: {
  kind?: MediaKind;
  language?: Language;
  limit: number;
  before?: string;
}): Promise<MediaAssetDto[]> {
  return prisma.mediaAsset.findMany({
    where: {
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.language ? { language: filters.language } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filters.limit,
    ...(filters.before ? { cursor: { id: filters.before }, skip: 1 } : {}),
    select: mediaSelect,
  });
}
