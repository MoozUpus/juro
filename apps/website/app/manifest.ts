import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JURO — Юрист в кармане",
    short_name: "JURO",
    description: "Юридическая ситуация превращается в понятные факты, риски и следующий шаг.",
    start_url: "/ru",
    display: "standalone",
    background_color: "#f8f6f2",
    theme_color: "#061827",
    lang: "ru",
    icons: [
      { src: "/favicon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
