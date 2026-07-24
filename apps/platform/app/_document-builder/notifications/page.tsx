import { chatGPTSignInPath, requireChatGPTUser } from "../../chatgpt-auth";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireChatGPTUser("/document-builder/notifications");
  return <NotificationsClient user={user} signInPath={chatGPTSignInPath("/document-builder/notifications")}/>;
}
