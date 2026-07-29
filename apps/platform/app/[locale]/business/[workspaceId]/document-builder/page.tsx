import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DocumentBuilderPage from "../../../../_document-builder/page";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformPath } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Создать документ",
  description: "Библиотека и интерактивный конструктор юридических документов JURO.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BusinessDocumentBuilder({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  await requireChatGPTUser(platformPath(locale, "business", "document-builder", workspaceId));
  return <DocumentBuilderPage />;
}
