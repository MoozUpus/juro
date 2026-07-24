import { chatGPTSignInPath, getChatGPTUser } from "../../../chatgpt-auth";
import { BuilderHeader } from "../../_components/BuilderHeader";
import { InvitationClient } from "./InvitationClient";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const returnTo = `/document-builder/invitations/${encodeURIComponent(token)}`;
  const user = await getChatGPTUser();
  return <div className="dbt-root"><BuilderHeader user={user} signInPath={chatGPTSignInPath(returnTo)}/>{user ? <InvitationClient token={token}/> : <main className="dbt-invitation-page"><section><h1>Войдите, чтобы открыть приглашение</h1><p>Доступ будет проверен для вашего аккаунта JURO.</p><a href={chatGPTSignInPath(returnTo)}>Войти в JURO</a></section></main>}</div>;
}
