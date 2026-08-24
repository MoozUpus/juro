import { headers } from "next/headers";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import CategoryPage from "../../../../_document-builder/[categorySlug]/page";
import { lawyerHostReturnTo } from "../../../../../lib/platform/lawyer-entry-routing";

export const dynamic = "force-dynamic";

export default async function CanonicalCategoryPage({ params }: { params: Promise<{ locale: string; accountType: string; categorySlug: string }> }) {
  const { locale, accountType, categorySlug } = await params;
  const fallback = `/${locale}/${accountType}/document-builder/${encodeURIComponent(categorySlug)}`;
  await requireChatGPTUser(lawyerHostReturnTo(await headers(), fallback));
  return <CategoryPage params={Promise.resolve({ categorySlug })}/>;
}
