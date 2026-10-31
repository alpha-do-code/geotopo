import type { NextConfig } from "next";

// Export statique : l'application est une PWA entièrement côté client.
// Les données vivent sur l'appareil (IndexedDB) et se synchronisent avec l'API GeoTopo.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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
