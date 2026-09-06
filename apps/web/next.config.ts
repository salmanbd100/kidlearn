import type { NextConfig } from "next";

/**
 * Hosts `next/image` is allowed to load from, as a comma-separated list of
 * origins in `MEDIA_ASSET_HOSTS` (e.g. `https://cdn.kidlearn.app`).
 */
/**
 * Where Google serves profile photos. Hard-coded rather than left to
 * `MEDIA_ASSET_HOSTS`: it is fixed by the sign-in provider, not by our
 * deployment, and a parent's avatar should not stop rendering because an
 * environment forgot a variable.
 */
const GOOGLE_AVATAR_PATTERN = new URL("https://lh3.googleusercontent.com/**");

function mediaRemotePatterns(): URL[] {
  const configured = process.env.MEDIA_ASSET_HOSTS?.trim();
  if (!configured) return [GOOGLE_AVATAR_PATTERN];

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => new URL(`${origin.replace(/\/$/, "")}/**`))
    .concat(GOOGLE_AVATAR_PATTERN);
}

const nextConfig: NextConfig = {
  // The shared UI package ships raw .ts/.tsx source — let Next transpile it.
  transpilePackages: ["@kidlearn/ui"],
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
};

export default nextConfig;
