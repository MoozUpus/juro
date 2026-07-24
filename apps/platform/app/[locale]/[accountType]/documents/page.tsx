import { requireChatGPTUser } from "../../../chatgpt-auth";
import DocumentsPage from "../../../_document-builder/documents/page";

export const dynamic = "force-dynamic";

export default async function CanonicalDocuments({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  await requireChatGPTUser(`/${locale}/${accountType}/documents`);
  return <DocumentsPage/>;
}
