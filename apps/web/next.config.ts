import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

type RemotePatterns = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>;

/**
 * Where Google serves profile photos. Hard-coded rather than left to
 * `MEDIA_ASSET_HOSTS`: it is fixed by the sign-in provider, not by our
 * deployment, and a parent's avatar should not stop rendering because an
 * environment forgot a variable.
 */
const GOOGLE_AVATAR_PATTERN = new URL("https://lh3.googleusercontent.com/**");

/**
 * Where the development seed points activity and quiz payload images. Hard-coded
 * for the same reason as the Google host above, and outside production only: it
 * is fixed by `packages/db/prisma/journey.ts`, not by a deployment, and every
 * developer who runs the seed needs it. An `ImageAssetRef` must be `https://`
 * (`packages/types/src/primitives.ts`), so these payloads cannot fall back to a
 * relative `/dev/` path the way a `MediaAsset` url does.
 *
 * Leaving it to `MEDIA_ASSET_HOSTS` made a forgotten variable fatal rather than
 * ugly: `next/image` *throws* on an unconfigured hostname, so a single
 * picture-select question took the whole lesson player down.
 *
 * Written in the object form rather than as a `new URL()`, which pins `search`
 * to the empty string: these placeholders carry their label as `?text=...`, and
 * a pattern with a pinned-empty query rejects that with a 400. Omitting `search`
 * is what allows any query string.
 */
const DEV_PLACEHOLDER_PATTERN = {
  protocol: "https",
  hostname: "placehold.co",
} as const;

/**
 * Hosts `next/image` is allowed to load from: the two above, plus a
 * comma-separated list of origins in `MEDIA_ASSET_HOSTS`
 * (e.g. `https://cdn.kidlearn.app`).
 */
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
 * `noindex` for the dev deployment, whose content has not been through admin
 * review (file 38 req 4). Deliberately not `NEXT_PUBLIC_` — the browser never
 * needs it — and production leaves it unset, so the header is absent there
 * rather than present-and-permissive.
 *
 * IT IS READ AT BUILD TIME, not per request. Next serialises `headers()` into
 * `.next/routes-manifest.json` during `next build`, so setting it on a running
 * server does nothing: on Vercel it takes a REDEPLOY, exactly like a
 * `NEXT_PUBLIC_` value, despite not carrying the prefix that advertises it.
 *
 * The API host carries the same header from a Caddy `header` directive; this
 * covers the web host only.
 */
const noindexHeaders: NonNullable<NextConfig["headers"]> = async () => {
  if (process.env.SITE_NOINDEX !== "true") return [];
  return [
    {
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ];
};

const nextConfig: NextConfig = {
  // The shared UI package ships raw .ts/.tsx source — let Next transpile it.
  transpilePackages: ["@kidlearn/ui"],
  /**
   * Escape hatch only (file 38 req 5). The frontend deploys to Vercel, which
   * needs none of this; `apps/web/Dockerfile` does, and an untested Dockerfile
   * is not an escape hatch. Harmless on Vercel, which ignores the standalone
   * tree it produces.
   */
  output: "standalone",
  /**
   * Trace from the repository root, not `apps/web`: the app imports two
   * workspace packages, and pnpm links them from outside this directory. Without
   * it, `.next/standalone` ships without `@kidlearn/ui` or `@kidlearn/types`.
   */
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
  headers: noindexHeaders,
};

export default nextConfig;
