import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import DocumentBuilderPage from "../../../_document-builder/page";
import { documentBuilderMetadataCopy } from "../../../../lib/platform/builder-workspace-copy";
import { lawyerHostReturnTo } from "../../../../lib/platform/lawyer-entry-routing";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...documentBuilderMetadataCopy(locale === "uz" ? "uz" : "ru"),
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function CanonicalDocumentBuilder({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  const requestHeaders = await headers();
  const fallback = `/${locale}/${accountType}/document-builder`;
  await requireChatGPTUser(lawyerHostReturnTo(requestHeaders, fallback));
  return <DocumentBuilderPage embedded signInPath={`/${locale}/${accountType}/document-builder`}/>;
}
