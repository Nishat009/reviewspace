import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nearly every page here is per-user and permission-checked, so we render
  // dynamically and skip Cache Components rather than wrapping each session
  // read in its own Suspense boundary.
  experimental: {
    // Enables forbidden()/unauthorized() and their 403/401 boundaries.
    authInterrupts: true,
    serverActions: {
      // Avatars and logos (≤ 5 MB) go through actions; screenshots upload
      // straight to storage and never pass through here.
      bodySizeLimit: "6mb",
    },
  },
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
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
