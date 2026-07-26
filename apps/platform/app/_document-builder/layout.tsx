import type { Metadata } from "next";
import "./document-builder.css";

export const metadata: Metadata = {
  title: "Юридические документы",
  description: "Единая библиотека и интерактивный конструктор юридических документов JURO.",
  robots: { index: false, follow: false },
};

export default function DocumentBuilderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
