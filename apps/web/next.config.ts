import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

type RemotePatterns = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>;

/** Google profile photos: fixed by the sign-in provider, so hard-coded rather than left to `MEDIA_ASSET_HOSTS`. */
const GOOGLE_AVATAR_PATTERN = new URL("https://lh3.googleusercontent.com/**");

/**
 * Where the dev seed points activity/quiz images (`packages/db/prisma/journey.ts`); outside production
 * only. `ImageAssetRef` must be `https://`, so these cannot use a relative `/dev/` path. Hard-coded
 * because `next/image` *throws* on an unconfigured hostname, taking the whole lesson player down.
 * Object form, not `new URL()`: that pins `search` to empty, and these placeholders carry `?text=...`.
 */
const DEV_PLACEHOLDER_PATTERN = {
  protocol: "https",
  hostname: "placehold.co",
} as const;

/** Hosts `next/image` may load from: the two above plus comma-separated origins in `MEDIA_ASSET_HOSTS`. */
function mediaRemotePatterns(): RemotePatterns {
  const defaults: RemotePatterns =
    process.env.NODE_ENV === "production"
      ? [GOOGLE_AVATAR_PATTERN]
      : [GOOGLE_AVATAR_PATTERN, DEV_PLACEHOLDER_PATTERN];

  const configured = process.env.MEDIA_ASSET_HOSTS?.trim();
  if (!configured) return defaults;

  const origins: RemotePatterns = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => new URL(`${origin.replace(/\/$/, "")}/**`));

  return [...origins, ...defaults];
}

/**
 * `noindex` for the dev deployment, whose content has not been through admin review. Not `NEXT_PUBLIC_`
 * and unset in production, so the header is absent there. READ AT BUILD TIME: Next serialises
 * `headers()` into `.next/routes-manifest.json`, so on Vercel changing it takes a REDEPLOY.
 * The API host carries the same header from Caddy; this covers the web host only.
 */
const siteHeaders: NonNullable<NextConfig["headers"]> = async () => {
  const headers = [
    // The dashboard edits child profiles on tablets where the Google session persists, so no page may be framed.
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // `?child=<id>` is in dashboard URLs; keep it out of any outbound Referer.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
  if (process.env.SITE_NOINDEX === "true") {
    headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  }
  return [{ source: "/:path*", headers }];
};

const nextConfig: NextConfig = {
  // The shared UI package ships raw .ts/.tsx source — let Next transpile it.
  transpilePackages: ["@kidlearn/i18n", "@kidlearn/ui"],
  /** Escape hatch for `apps/web/Dockerfile`; Vercel needs none of this and ignores the standalone tree. */
  output: "standalone",
  /** Trace from the repo root: pnpm links workspace packages from outside this directory, or standalone ships without them. */
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
  headers: siteHeaders,
};

/**
 * An unset `NEXT_PUBLIC_API_URL` inlines `http://localhost:4000` into the client bundle, so every visitor's browser
 * calls itself. Fatal on Vercel, which sets `VERCEL=1` for every deployment build; only a warning elsewhere, because
 * CI's `pnpm build` and a local build run without it on purpose.
 */
function checkApiUrl(): void {
  if (process.env.NEXT_PUBLIC_API_URL?.trim()) return;
  const message =
    "NEXT_PUBLIC_API_URL is unset: the client bundle will call http://localhost:4000.";
  if (process.env.VERCEL === "1") {
    throw new Error(
      `${message} Set it in the Vercel project settings and redeploy.`,
    );
  }
  console.warn(
    `\nWARNING: ${message} Fine for CI or a local check; never deploy this build.\n`,
  );
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) checkApiUrl();
  return nextConfig;
}
