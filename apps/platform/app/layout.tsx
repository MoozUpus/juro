import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./invite/invite.css";
import "./legal/legal.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.juro.uz"),
  title: { default: "JURO — защищённое юридическое пространство", template: "%s — JURO" },
  description: "Личный кабинет цифровой юридической платформы JURO.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin-when-cross-origin",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: `(function(){var m=location.pathname.match(/^\\/(ru|uz)(?:\\/|$)/);var q=new URLSearchParams(location.search).get("lang");document.documentElement.lang=m?m[1]:(q==="uz"?"uz":"ru");})();` }} />
        {children}
      </body>
    </html>
  );
}
