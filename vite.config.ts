import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/ma-bommala-koluvu/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", ".nojekyll"],
      manifest: {
        name: "Ma Bommala Koluvu",
        short_name: "Koluvu",
        description: "A calm place to remember every doll on the festival steps.",
        start_url: "/ma-bommala-koluvu/",
        scope: "/ma-bommala-koluvu/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FBF3E4",
        theme_color: "#6E1E2A",
        lang: "te",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/ma-bommala-koluvu/index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,ico,webmanifest}"],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
