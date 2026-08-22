import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const themeBootstrap = `(function(){try{var c=document.cookie.match(/(?:^|; )juro_theme=(system|light|dark)(?:;|$)/);var l=localStorage.getItem("juro-theme");var m=c?c[1]:(l==="light"||l==="dark"||l==="system"?l:"system");var d=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;document.documentElement.dataset.theme=d;document.documentElement.dataset.themeMode=m;document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.themeMode="system";}})();`;

export const viewport: Viewport = {
  themeColor: "#061827",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://juro.uz"),
  title: { default: "JURO — AI-юрист и юридическая помощь в Узбекистане", template: "%s — JURO" },
  description: "Цифровая юридическая платформа: AI-помощь, документы и живые юристы в одном сервисе.",
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  category: "Legal technology",
  applicationName: "JURO",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get("x-juro-request-path") ?? "";
  const locale = /^\/uz(?:\/|$)/.test(requestPath) ? "uz" : /^\/en(?:\/|$)/.test(requestPath) ? "en" : "ru";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://juro.uz/#organization", name: "JURO", alternateName: "JURO Uzbekistan", url: "https://juro.uz", logo: { "@type": "ImageObject", url: "https://juro.uz/juro-logo-primary.png" }, description: "JURO is a LegalTech platform for legal tasks in Uzbekistan.", areaServed: { "@type": "Country", name: "Uzbekistan" }, email: "admin@juro.uz", telephone: "+998974022292", address: { "@type": "PostalAddress", addressLocality: "Tashkent", addressCountry: "UZ" } },
      { "@type": "WebSite", "@id": "https://juro.uz/#website", url: "https://juro.uz", name: "JURO", alternateName: "JURO Uzbekistan", inLanguage: ["ru", "uz", "en"], publisher: { "@id": "https://juro.uz/#organization" } },
    ],
  }).replaceAll("<", "\\u003c");
  return (
    <html className={manrope.variable} lang={locale} suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {children}
      </body>
    </html>
  );
}
