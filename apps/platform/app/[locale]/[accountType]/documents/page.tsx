import { requireChatGPTUser } from "../../../chatgpt-auth";
import DocumentsPage from "../../../_document-builder/documents/page";

export const dynamic = "force-dynamic";

export default async function CanonicalDocuments({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  const returnTo = `/${locale}/${accountType}/documents`;
  const user = await requireChatGPTUser(returnTo);
  return <DocumentsPage embedded returnTo={returnTo} user={user}/>;
}
