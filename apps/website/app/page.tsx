import type { Metadata } from "next";
import { CinematicLandingPage } from "./components/cinematic/CinematicLandingPage";
import { ru } from "../content/ru";

export const metadata: Metadata = {
  title: ru.meta.title,
  description: ru.meta.description,
  alternates: {
    canonical: "https://juro.uz/ru",
    languages: {
      ru: "https://juro.uz/ru",
      uz: "https://juro.uz/uz",
      "x-default": "https://juro.uz/ru",
    },
  },
  openGraph: {
    title: ru.meta.title,
    description: ru.meta.description,
    url: "https://juro.uz/ru",
    siteName: "JURO",
    locale: "ru_RU",
    alternateLocale: ["uz_UZ"],
    type: "website",
    images: [{ url: "/juro-og.png", width: 1681, height: 909, alt: "JURO — AI и живой юрист в одном пространстве" }],
  },
  twitter: {
    card: "summary_large_image",
    title: ru.meta.title,
    description: ru.meta.description,
    images: ["/juro-og.png"],
  },
};

export default function Home() {
  return <CinematicLandingPage language="ru" />;
}
