import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./invite/invite.css";
import "./legal/legal.css";
import "./_platform/lawyer-workspace.css";
import { THEME_BOOTSTRAP_SCRIPT } from "./_theme/theme";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataHosts = new Set([
  "app.juro.uz",
  "app.staging.juro.uz",
  "lawyer.juro.uz",
  "lawyer.staging.juro.uz",
  "status.juro.uz",
  "status.staging.juro.uz",
]);

export function metadataBaseForHost(hostHeader: string | null): URL {
  const hostname = hostHeader?.trim().toLowerCase().replace(/:\d+$/u, "") ?? "";
  return new URL(`https://${metadataHosts.has(hostname) ? hostname : "app.juro.uz"}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  return {
    metadataBase: metadataBaseForHost(requestHeaders.get("host")),
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
}

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
    <html
      className={`${manrope.variable} ${geistMono.variable}`}
      lang="ru"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){var m=location.pathname.match(/^\\/(ru|uz)(?:\\/|$)/);var q=new URLSearchParams(location.search).get("lang");var s=location.hostname.toLowerCase()==="status.juro.uz"||location.hostname.toLowerCase()==="status.staging.juro.uz";document.documentElement.lang=m?m[1]:(q==="uz"?"uz":q==="ru"?"ru":s?"uz":"ru");})();` }} />
        {children}
      </body>
    </html>
  );
}
