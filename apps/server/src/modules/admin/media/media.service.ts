import type { Language, MediaKind, Prisma } from "@kidlearn/db";
import { v2 as cloudinary, type UploadApiErrorResponse } from "cloudinary";
import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export function uploadFolderFor(kind: MediaKind): string {
  return `kidlearn/${kind}`;
}

// Signed, so the browser cannot widen it (an HTML page or scripted SVG on our delivery host); SVG is excluded from `image` deliberately.
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

// Every signed parameter must be posted back exactly or Cloudinary refuses, so the browser is handed each one.
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

export function deliveryUrlPrefix(): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
}

// A prefix test alone passes `<cloud>/../other-cloud/x.png`, which the browser normalises onto another cloud; so parse and refuse dot segments, raw or percent-encoded.
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
    /** The generating job; absent for a browser upload. The review queue and its publish guard depend on it. */
    aiJobId?: string;
  },
  /** The transaction to write inside: the asset row and the job's audit record must land together or not at all. */
  client: Prisma.TransactionClient = prisma,
): Promise<MediaAssetDto> {
  return client.mediaAsset.create({ data: input, select: mediaSelect });
}

export type UploadResourceType = "image" | "video";

export function resourceTypeFor(kind: MediaKind): UploadResourceType {
  return kind === "image" ? "image" : "video";
}

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

// `id` breaks a `createdAt` tie so assets registered in the same millisecond page without repeats or gaps.
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
