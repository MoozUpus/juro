import { chatGPTSignInPath, getChatGPTUser } from "../../../chatgpt-auth";
import { BuilderHeader } from "../../_components/BuilderHeader";
import { builderText } from "../../builder-localization";
import { publicBuilderLocale, publicBuilderReturnPath } from "../../public-builder-locale";
import { InvitationClient } from "./InvitationClient";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { token } = await params;
  const locale = await publicBuilderLocale((await searchParams).lang);
  const returnTo = publicBuilderReturnPath(`/document-builder/invitations/${encodeURIComponent(token)}`, locale);
  const user = await getChatGPTUser();
  const copy = builderText(locale, {
    ru: { title: "Войдите, чтобы открыть приглашение", description: "Доступ будет проверен для вашего аккаунта JURO.", action: "Войти в JURO" },
    uz: { title: "Taklifnomani ochish uchun tizimga kiring", description: "Kirish huquqi JURO hisobingiz uchun tekshiriladi.", action: "JURO hisobiga kirish" },
    en: { title: "Sign in to open this invitation", description: "JURO will verify that this invitation belongs to your account.", action: "Sign in to JURO" },
  });
  const signInPath = chatGPTSignInPath(returnTo);
  return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath} locale={locale}/>{user ? <InvitationClient token={token} locale={locale}/> : <main className="dbt-invitation-page" lang={locale}><section><h1>{copy.title}</h1><p>{copy.description}</p><a href={signInPath}>{copy.action}</a></section></main>}</div>;
}
