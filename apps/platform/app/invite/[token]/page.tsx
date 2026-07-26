import { requireChatGPTUser } from "../../chatgpt-auth";
import { InviteAcceptClient } from "./InviteAcceptClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireChatGPTUser(`/invite/${encodeURIComponent(token)}`);
  return <InviteAcceptClient token={token} />;
}
