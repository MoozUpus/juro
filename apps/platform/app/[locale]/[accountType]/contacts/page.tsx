import { requireChatGPTUser } from "../../../chatgpt-auth";
import ContactsPage from "../../../_document-builder/contacts/page";

export const dynamic = "force-dynamic";

export default async function CanonicalContacts({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  await requireChatGPTUser(`/${locale}/${accountType}/contacts`);
  return <ContactsPage/>;
}
