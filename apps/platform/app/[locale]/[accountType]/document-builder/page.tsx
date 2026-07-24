import { requireChatGPTUser } from "../../../chatgpt-auth";
import DocumentBuilderPage from "../../../_document-builder/page";

export const dynamic = "force-dynamic";

export default async function CanonicalDocumentBuilder({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  await requireChatGPTUser(`/${locale}/${accountType}/document-builder`);
  return <DocumentBuilderPage/>;
}
