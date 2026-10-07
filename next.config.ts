import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
