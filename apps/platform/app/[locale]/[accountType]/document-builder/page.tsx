import type { Metadata } from "next";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import DocumentBuilderPage from "../../../_document-builder/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Создать документ",
  description: "Библиотека и интерактивный конструктор юридических документов JURO.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CanonicalDocumentBuilder({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  await requireChatGPTUser(`/${locale}/${accountType}/document-builder`);
  return <DocumentBuilderPage/>;
}
