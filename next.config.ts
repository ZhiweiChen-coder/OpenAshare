import type { NextConfig } from "next";

const distDir = process.env.NODE_ENV === "development" ? ".next-dev" : ".next";

const nextConfig: NextConfig = {
  distDir,
  reactStrictMode: true,
  experimental: {
    devtoolSegmentExplorer: false,
    browserDebugInfoInTerminal: false,
  },
};

export default nextConfig;
