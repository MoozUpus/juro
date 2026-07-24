import { cookies } from "next/headers";

export const SAFE_QUERY = new Set(["draftId", "documentId", "caseId", "stepId", "invitation", "return_to"]);

export async function canonicalBuilderUrl(request: Request, suffix = "document-builder") {
  const source = new URL(request.url);
  const store = await cookies();
  const queryLocale = source.searchParams.get("lang");
  const queryType = source.searchParams.get("accountType");
  const locale = queryLocale === "uz" || store.get("juro_locale")?.value === "uz" ? "uz" : "ru";
  const accountType = queryType === "business" || store.get("juro_account_type")?.value === "business" ? "business" : "individual";
  const target = new URL(`/${locale}/${accountType}/${suffix}`, source.origin);
  for (const [key, value] of source.searchParams) if (SAFE_QUERY.has(key)) target.searchParams.append(key, value);
  return target;
}
