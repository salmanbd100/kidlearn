import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared UI package ships raw .ts/.tsx source — let Next transpile it.
  transpilePackages: ["@kidlearn/ui"],
};

export default nextConfig;
