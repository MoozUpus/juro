import { notFound } from "next/navigation";

import DocumentPage from "../../../../../_document-builder/documents/[id]/page";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

type Query = { print?: string; consultation?: string; request?: string };

export default async function BusinessDocument({ params, searchParams }: { params: Promise<{ locale: string; workspaceId: string; id: string }>; searchParams: Promise<Query> }) {
  const { locale, workspaceId, id } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const query = await searchParams;
  const print = query.print === "1" ? "?print=1" : "";
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/documents/${encodeURIComponent(id)}${print}`);
  return <DocumentPage params={Promise.resolve({ id })} searchParams={Promise.resolve(query)} />;
}
