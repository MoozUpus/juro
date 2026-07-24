import { notFound } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "../../chatgpt-auth";
import { DOCUMENT_CATEGORIES, getCategory, getLibraryDocumentsByCategory } from "../../../lib/document-builder/registry";
import { BuilderHeader } from "../_components/BuilderHeader";
import { DocumentLibraryClient } from "../_components/DocumentLibraryClient";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  const category = getCategory(categorySlug);
  if (!category) notFound();
  const user = await getChatGPTUser();
  return <div className="dbt-root"><BuilderHeader user={user} signInPath={chatGPTSignInPath(`/document-builder/${categorySlug}`)}/><DocumentLibraryClient categories={DOCUMENT_CATEGORIES} documents={getLibraryDocumentsByCategory(categorySlug)} activeCategory={category}/></div>;
}
