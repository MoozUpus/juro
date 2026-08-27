import type { Metadata } from "next";
import { englishInvestorVideo } from "../../investor-video";
import { SiteFooter, SiteHeader } from "../../components/public/SiteChrome";
import styles from "../../[locale]/video/video.module.css";

const canonical = "https://juro.uz/en/video";

export const metadata: Metadata = {
  title: "JURO video presentation",
  description: "A short JURO video presentation: legal help, AI tools, and the next step in one platform.",
  alternates: {
    canonical,
    languages: {
      ru: "https://juro.uz/ru/video",
      uz: "https://juro.uz/uz/video",
      en: canonical,
      "x-default": "https://juro.uz/ru/video",
    },
  },
  openGraph: {
    title: "JURO video presentation",
    description: "See how JURO turns a legal question into a clear next step.",
    url: canonical,
    siteName: "JURO",
    locale: "en_US",
    alternateLocale: ["ru_RU", "uz_UZ"],
    type: "website",
    images: [{ url: "/juro-og.png", width: 1681, height: 909, alt: "JURO video presentation" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "JURO video presentation",
    description: "See how JURO turns a legal question into a clear next step.",
    images: ["/juro-og.png"],
  },
};

export default function EnglishInvestorVideoPage() {
  return (
    <div className={styles.page} lang="en">
      <SiteHeader languageHref="/ru/video" locale="en" tone="dark" />
      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero}>
          <p>JURO VIDEO PRESENTATION</p>
          <h1>See how JURO turns a legal question into a clear next step</h1>
          <span>2 MIN 42 SEC · 1080P</span>
        </section>

        <section aria-label="JURO video presentation" className={styles.player}>
          <video autoPlay controls muted playsInline preload="auto">
            <source src={englishInvestorVideo.source} type="video/mp4" />
            <a href={englishInvestorVideo.source}>Open the MP4 file</a>
          </video>
          <p>The video starts automatically without sound. Turn it on in the player controls when you are ready.</p>
        </section>
      </main>
      <SiteFooter locale="en" />
    </div>
  );
}
