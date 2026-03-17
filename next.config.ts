import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Alte WordPress-URLs → neue Seiten (ergänzen bei Go-Live)
    ];
  },
};

export default nextConfig;
