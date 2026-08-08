import type { NextConfig } from "next";

/**
 * Hosts `next/image` is allowed to load from, as a comma-separated list of
 * origins in `MEDIA_ASSET_HOSTS` (e.g. `https://cdn.kidlearn.app`).
 *
 * `MediaAsset.url` is a free-form string the CMS fills in, and `next/image`
 * refuses any remote host not listed here — so a character illustration, a badge
 * icon or a story page would throw at render time rather than fail quietly. No
 * host is hard-coded because none exists yet: the illustrated character sheet
 * comes from the content pipeline (design.md §9) and every seeded character
 * currently reports `imageUrl: null`.
 *
 * Reading it from the environment is what keeps the promise the avatar code
 * makes — that attaching real artwork is a data change. Without this, it would
 * also be a code change, discovered the first time an image rendered.
 */
function mediaRemotePatterns(): URL[] {
  const configured = process.env.MEDIA_ASSET_HOSTS?.trim();
  if (!configured) return [];

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => new URL(`${origin.replace(/\/$/, "")}/**`));
}

const nextConfig: NextConfig = {
  // The shared UI package ships raw .ts/.tsx source — let Next transpile it.
  transpilePackages: ["@kidlearn/ui"],
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
};

export default nextConfig;
