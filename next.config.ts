import type { NextConfig } from "next";

// cacheComponents desactivado: CEPRA es una app con sesión y datos en tiempo
// real; casi todo depende del usuario, así que el caché por componente no aporta.
const nextConfig: NextConfig = {
  // Genera un servidor autocontenido (.next/standalone) para la imagen de Docker.
  output: "standalone",
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
