import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beaco Notification Operations",
    short_name: "Beaco",
    description: "Reliable notification delivery, recovery, and audit operations.",
    start_url: "/",
    display: "standalone",
    background_color: "#060605",
    theme_color: "#060605",
    icons: [
      {
        src: "/brand/png/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/png/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/brand/png/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
