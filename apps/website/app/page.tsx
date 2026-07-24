import type { Metadata } from "next";
import { LandingTestPage } from "./components/landing-test/LandingTestPage";

export const metadata: Metadata = {
  title: "JURO — Юрист в кармане для людей и бизнеса",
  description: "AI-юрист, создание и проверка документов, планы действий и консультации живых юристов в одном защищённом пространстве.",
  alternates: { canonical: "https://juro.uz/" },
  openGraph: {
    title: "JURO — Юрист в кармане",
    description: "От юридического вопроса до документа, плана действий и консультации.",
    url: "https://juro.uz/",
    siteName: "JURO",
    type: "website",
    images: [{ url: "/juro-og.png", width: 1681, height: 909, alt: "JURO: от юридического вопроса к документу и плану действий" }],
  },
  twitter: { card: "summary_large_image", title: "JURO — Юрист в кармане", description: "От юридического вопроса до документа, плана действий и консультации.", images: ["/juro-og.png"] },
};

export default function Home() {
  return <LandingTestPage />;
}
