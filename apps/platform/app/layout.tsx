import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";
import "./invite/invite.css";
import "./legal/legal.css";
import { GlobalThemeControl } from "./_platform/GlobalThemeControl";

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

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2e9" },
    { media: "(prefers-color-scheme: dark)", color: "#071a2e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale is selected from the canonical route by the inline script before
  // hydration. The root App Router layout has no route params, so React's
  // static server fallback remains Russian; suppress only this deliberately
  // pre-hydration attribute difference rather than masking descendant errors.
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s="";try{s=localStorage.getItem("juro-theme")||""}catch(e){}if(s!=="light"&&s!=="dark"){var m=document.cookie.match(/(?:^|; )juro_theme=(light|dark)/);s=m?m[1]:""}var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})();` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: `(function(){var m=location.pathname.match(/^\\/(ru|uz)(?:\\/|$)/);var q=new URLSearchParams(location.search).get("lang");document.documentElement.lang=m?m[1]:(q==="uz"?"uz":"ru");})();` }} />
        <GlobalThemeControl />
        {children}
      </body>
    </html>
  );
}
