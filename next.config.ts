import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate build dir for the demo build (NEXT_PUBLIC_* is inlined at build time).
  distDir: process.env.TOQUE_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
