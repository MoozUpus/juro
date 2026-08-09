import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const juroDisplay = Cormorant_Garamond({
  variable: "--font-juro-display",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#061827",
  colorScheme: "light",
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
  const locale = /^\/uz(?:\/|$)/.test(requestPath) ? "uz" : "ru";
  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${juroDisplay.variable}`}>
        {children}
      </body>
    </html>
  );
}
