import { requireChatGPTUser } from "../../chatgpt-auth";
import { isLocale } from "../../../lib/platform/routing";
import { InviteAcceptClient } from "./InviteAcceptClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const requestedLocale = typeof query.lang === "string" ? query.lang : "";
  const locale = isLocale(requestedLocale) ? requestedLocale : "ru";
  await requireChatGPTUser(
    `/invite/${encodeURIComponent(token)}?lang=${locale}`,
  );
  return <InviteAcceptClient token={token} locale={locale} />;
}
