import { requireChatGPTUser } from "../../../../chatgpt-auth";
import DocumentPage from "../../../../_document-builder/documents/[id]/page";

export const dynamic = "force-dynamic";

type Query = { print?: string; consultation?: string; request?: string };

export default async function CanonicalDocument({ params, searchParams }: { params: Promise<{ locale: string; accountType: string; id: string }>; searchParams: Promise<Query> }) {
  const { locale, accountType, id } = await params;
  const query = await searchParams;
  const print = query.print === "1" ? "?print=1" : "";
  await requireChatGPTUser(`/${locale}/${accountType}/documents/${encodeURIComponent(id)}${print}`);
  return <DocumentPage params={Promise.resolve({ id })} searchParams={Promise.resolve(query)}/>;
}
