import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { loadStoredDocument } from "../../../../lib/document-builder/permissions";
import { getDocumentByCode } from "../../../../lib/document-builder/registry";
import { getOrCreateUserProfile } from "../../../../lib/document-builder/storage/db";
import { ConfigurableDocumentBuilder } from "../../_components/ConfigurableDocumentBuilder";
import { BuilderHeader } from "../../_components/BuilderHeader";
import { DocumentBuilderClient } from "../../DocumentBuilderClient";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; consultation?: string; request?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireChatGPTUser(`/document-builder/documents/${id}${query.print === "1" ? "?print=1" : ""}`);
  const profile = await getOrCreateUserProfile(user);
  const stored = await loadStoredDocument(id, profile.id);
  if (!stored) notFound();
  const configured = stored.templateCode ? getDocumentByCode(stored.templateCode) : undefined;
  if (configured) {
    return <div className="dbt-root"><BuilderHeader user={user}/><ConfigurableDocumentBuilder definition={configured} initialUser={user} signInPath="" initialDocumentId={id}/></div>;
  }
  const consultation: { type: "ai" | "lawyer"; requestId: string } | null = (query.consultation === "ai" || query.consultation === "lawyer") && query.request
    ? { type: query.consultation, requestId: query.request }
    : null;
  return <DocumentBuilderClient initialUser={user} signInPath="" initialDocumentId={id} printMode={query.print === "1"} initialConsultation={consultation}/>;
}
