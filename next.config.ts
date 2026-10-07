import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // NEXT_DIST_DIR lets a production build run next to `next dev` without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [{ source: "/landing", destination: "/", permanent: false }];
  },
};

export default nextConfig;
