import { chatGPTSignInPath, requireChatGPTUser } from "../../chatgpt-auth";
import { ContactsClient } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const user = await requireChatGPTUser("/document-builder-test/contacts");
  return <ContactsClient user={user} signInPath={chatGPTSignInPath("/document-builder-test/contacts")}/>;
}
