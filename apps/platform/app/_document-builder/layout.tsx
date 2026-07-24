import type { Metadata } from "next";
import "./document-builder.css";

export const metadata: Metadata = {
  title: "Создать документ — JURO",
  description: "Рабочий конструктор расписки в получении денежных средств.",
  robots: { index: false, follow: false },
};

export default function DocumentBuilderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
