import { chatGPTSignInPath, requireChatGPTUser } from "../../chatgpt-auth";
import { DocumentsClient } from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireChatGPTUser("/document-builder-test/documents");
  return <DocumentsClient user={user} signInPath={chatGPTSignInPath("/document-builder-test/documents")}/>;
}
