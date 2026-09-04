import type { Language, MediaKind, Prisma } from "@kidlearn/db";
import { v2 as cloudinary, type UploadApiErrorResponse } from "cloudinary";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

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

export type UploadSignature = {
  timestamp: number;
  folder: string;
  signature: string;
  apiKey: string;
  cloudName: string;
};

/**
 * The signed parameter set the browser posts to Cloudinary alongside the file.
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

/** The prefix every delivery URL for this account starts with. */
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

/** The library, newest first. */
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
