import { requireChatGPTUser } from "../../../chatgpt-auth";
import { DocumentBuilderClient } from "../../DocumentBuilderClient";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; consultation?: string; request?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireChatGPTUser(`/document-builder-test/documents/${id}${query.print === "1" ? "?print=1" : ""}`);
  const consultation: { type: "ai" | "lawyer"; requestId: string } | null = (query.consultation === "ai" || query.consultation === "lawyer") && query.request
    ? { type: query.consultation, requestId: query.request }
    : null;
  return <DocumentBuilderClient initialUser={user} signInPath="" initialDocumentId={id} printMode={query.print === "1"} initialConsultation={consultation}/>;
}
