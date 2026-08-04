import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {},
  async rewrites() {
    const backend = (process.env.INTERNAL_API_URL ?? "http://api:8000").replace(/\/+$/, "");
    return [
      {
        source: "/media/:path*",
        destination: `${backend}/media/:path*`,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const extraIgnored = ["**/.next_backup*/**", "**/playwright-report/**", "**/test-results/**"];
      const wo = config.watchOptions ?? {};
      const prev = wo.ignored;
      const mergedIgnored =
        prev === undefined ? extraIgnored : Array.isArray(prev) ? [...prev, ...extraIgnored] : [prev, ...extraIgnored];
      config.watchOptions = {
        ...wo,
        aggregateTimeout: 400,
        ignored: mergedIgnored,
      };
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        pathname: "/v1/create-qr-code/**",
      },
    ],
  },
};

export default nextConfig;
