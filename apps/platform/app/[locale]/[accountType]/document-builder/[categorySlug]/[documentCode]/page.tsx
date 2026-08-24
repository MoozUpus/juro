import { headers } from "next/headers";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import ConfiguredDocumentPage from "../../../../../_document-builder/[categorySlug]/[documentCode]/page";
import { lawyerHostReturnTo } from "../../../../../../lib/platform/lawyer-entry-routing";

export const dynamic = "force-dynamic";

export default async function CanonicalConfiguredDocument({ params }: { params: Promise<{ locale: string; accountType: string; categorySlug: string; documentCode: string }> }) {
  const { locale, accountType, categorySlug, documentCode } = await params;
  const fallback = `/${locale}/${accountType}/document-builder/${encodeURIComponent(categorySlug)}/${encodeURIComponent(documentCode)}`;
  await requireChatGPTUser(lawyerHostReturnTo(await headers(), fallback));
  return <ConfiguredDocumentPage params={Promise.resolve({ categorySlug, documentCode })}/>;
}
