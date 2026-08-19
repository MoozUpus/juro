"use client";

import { useEffect } from "react";
import { ru } from "../../../content/ru";
import { uz } from "../../../content/uz";
import { en } from "../../../content/en";
import type { PublicLanguage } from "../../../content/types";
import { JuroHomepage } from "../public/JuroHomepage";

export function CinematicLandingPage({
  language,
}: {
  language: PublicLanguage;
}) {
  const content = language === "ru" ? ru : language === "uz" ? uz : en;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
  const structuredData = JSON.stringify(faqSchema).replaceAll("<", "\\u003c");

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: structuredData }}
        type="application/ld+json"
      />
      <JuroHomepage language={language} />
    </>
  );
}
