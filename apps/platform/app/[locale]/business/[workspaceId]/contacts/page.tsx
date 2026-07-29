import { notFound } from "next/navigation";

import ContactsPage from "../../../../_document-builder/contacts/page";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformPath } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessContacts({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  await requireChatGPTUser(platformPath(locale, "business", "contacts", workspaceId));
  return <ContactsPage />;
}
