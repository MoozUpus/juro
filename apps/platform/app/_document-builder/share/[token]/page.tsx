import type { Metadata } from "next";
import Image from "next/image";
import { sha256 } from "../../../../lib/document-builder/share-links/crypto";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { paragraphsFromFinalText } from "../../../../lib/document-builder/generation/paragraphs";
import { PublicDocumentView } from "../../_components/PublicDocumentView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Документ",
  robots: { index: false, follow: false, nocache: true },
};

interface ShareRecord {
  title: string;
  finalContent: string;
  expiresAt: string;
  revokedAt: string | null;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = await sha256(token);
  let record: ShareRecord | null = null;
  try {
    record = await requireD1().prepare(
      `SELECT d.title, c.final_content AS finalContent, s.expires_at AS expiresAt, s.revoked_at AS revokedAt
       FROM document_share_links s JOIN documents d ON d.id = s.document_id
       JOIN document_current_content c ON c.document_id = d.id
       WHERE s.token_hash = ? LIMIT 1`,
    ).bind(tokenHash).first<ShareRecord>();
  } catch {
    record = null;
  }
  if (!record || record.revokedAt || record.expiresAt <= new Date().toISOString()) {
    return <main className="dbt-public-message"><Image src="/juro-logo-primary.png" alt="JURO" width={140} height={137} unoptimized/><h1>Ссылка недействительна</h1><p>Срок действия ссылки истёк либо владелец отозвал доступ.</p></main>;
  }
  return <PublicDocumentView title={record.title} paragraphs={paragraphsFromFinalText(record.finalContent)} />;
}
