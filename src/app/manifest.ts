import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

/** Installable app (PWA). Opens on the captain screens, which work offline (BUILD_SPEC §8). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("pwa");
  return {
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    id: "/captain",
    start_url: "/captain",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#04060c",
    theme_color: "#04060c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
