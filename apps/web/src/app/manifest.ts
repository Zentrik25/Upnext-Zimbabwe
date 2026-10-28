import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.short,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    lang: "en",
    icons: [
      { src: BRAND.assets.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: BRAND.assets.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: BRAND.assets.iconMaskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
