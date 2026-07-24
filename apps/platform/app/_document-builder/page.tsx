import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import { DocumentBuilderLoader } from "./DocumentBuilderLoader";

export const dynamic = "force-dynamic";

export default async function DocumentBuilderTestPage() {
  const user = await getChatGPTUser();
  return <DocumentBuilderLoader initialUser={user} signInPath={chatGPTSignInPath("/document-builder-test?resume=1")}/>;
}
