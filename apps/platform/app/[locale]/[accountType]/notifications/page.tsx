import { requireChatGPTUser } from "../../../chatgpt-auth";
import NotificationsPage from "../../../_document-builder/notifications/page";

export const dynamic = "force-dynamic";

export default async function CanonicalNotifications({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  await requireChatGPTUser(`/${locale}/${accountType}/notifications`);
  return <NotificationsPage/>;
}
