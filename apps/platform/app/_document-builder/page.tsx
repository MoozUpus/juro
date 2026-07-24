import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";
import { DOCUMENT_CATEGORIES, DOCUMENT_LIBRARY } from "../../lib/document-builder/registry";
import { BuilderHeader } from "./_components/BuilderHeader";
import { DocumentLibraryClient } from "./_components/DocumentLibraryClient";

export const dynamic = "force-dynamic";

export default async function DocumentBuilderTestPage() {
  const user = await getChatGPTUser();
  return <div className="dbt-root"><BuilderHeader user={user} signInPath={chatGPTSignInPath("/document-builder")}/><DocumentLibraryClient categories={DOCUMENT_CATEGORIES} documents={DOCUMENT_LIBRARY} signedIn={Boolean(user)}/></div>;
}
