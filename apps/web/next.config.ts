import type { NextConfig } from "next";

/**
 * Hosts `next/image` is allowed to load from, as a comma-separated list of
 * origins in `MEDIA_ASSET_HOSTS` (e.g. `https://cdn.kidlearn.app`).
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
