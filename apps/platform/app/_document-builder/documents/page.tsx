import {
  chatGPTSignInPath,
  requireChatGPTUser,
  type ChatGPTUser,
} from "../../chatgpt-auth";
import { DocumentsClient } from "./DocumentsClient";

export const dynamic = "force-dynamic";

type DocumentsPageProps = {
  /** A compact document toolbar inside the authenticated platform shell. */
  embedded?: boolean;
  /** Lets canonical routes preserve their own post-login destination. */
  returnTo?: string;
  /** Avoids resolving the same authenticated principal twice in route wrappers. */
  user?: ChatGPTUser;
  signInPath?: string;
};

export default async function DocumentsPage({
  embedded = false,
  returnTo = "/document-builder/documents",
  user: suppliedUser,
  signInPath,
}: DocumentsPageProps = {}) {
  const user = suppliedUser ?? await requireChatGPTUser(returnTo);
  return (
    <DocumentsClient
      embedded={embedded}
      signInPath={signInPath ?? chatGPTSignInPath(returnTo)}
      user={user}
    />
  );
}
