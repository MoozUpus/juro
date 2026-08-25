import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import { CookieConsentBanner } from "./components/public/CookieConsentBanner";
import { PublicAnalyticsBridge } from "./components/public/PublicAnalyticsBridge";
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
  title: { default: "JURO — Юрист в кармане", template: "%s — JURO" },
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
  return (
    <html className={manrope.variable} lang={locale} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <PublicAnalyticsBridge locale={locale} />
        <CookieConsentBanner locale={locale} />
        {children}
      </body>
    </html>
  );
}
