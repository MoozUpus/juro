import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import DocumentPage from "../../../../../_document-builder/documents/[id]/page";

export const dynamic = "force-dynamic";

type Query = { print?: string; consultation?: string; request?: string };

export default async function CanonicalDocumentEdit({ params, searchParams }: { params: Promise<{ locale: string; accountType: string; id: string }>; searchParams: Promise<Query> }) {
  const { locale, accountType, id } = await params;
  const query = await searchParams;
  await requireChatGPTUser(`/${locale}/${accountType}/documents/${encodeURIComponent(id)}/edit`);
  return <DocumentPage params={Promise.resolve({ id })} searchParams={Promise.resolve(query)}/>;
}
