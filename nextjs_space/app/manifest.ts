import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LockonDocs",
    short_name: "LockonDocs",
    description: "Securely scan, organize and store your personal documents.",
    start_url: "/home?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fdfcfa",
    theme_color: "#b8902e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
