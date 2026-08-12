import { notFound } from "next/navigation";

import DocumentsPage from "../../../../_document-builder/documents/page";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import {
  isLocale,
  isWorkspaceId,
  platformPath,
} from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessDocuments({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const returnTo = platformPath(locale, "business", "documents", workspaceId);
  const user = await requireChatGPTUser(returnTo);
  return <DocumentsPage embedded returnTo={returnTo} user={user}/>;
}
