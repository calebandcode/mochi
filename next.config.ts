import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@smartspectra/node-sdk", "koffi"],
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
