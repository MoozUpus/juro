import type { Metadata } from "next";
import { AuthPage } from "../_auth/AuthPage";
import { authPageMetadata } from "../_auth/auth-metadata";

export const dynamic = "force-dynamic";

type RegisterQuery = {
  lang?: string;
  accountType?: string;
  returnTo?: string;
};

function localeFromQuery(lang?: string) {
  return lang === "en" ? "en" : lang === "ru" ? "ru" : "uz";
}

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<RegisterQuery>;
}): Promise<Metadata> {
  const query = await searchParams;
  return authPageMetadata(localeFromQuery(query.lang), "register");
}

export default async function Register({ searchParams }: {
  searchParams: Promise<RegisterQuery>;
}) {
  const query = await searchParams;
  return <AuthPage
    mode="register"
    locale={localeFromQuery(query.lang)}
    accountType={query.accountType}
    returnTo={query.returnTo}
  />;
}
