import type { Metadata } from "next";
import { sha256 } from "../../../../lib/document-builder/share-links/crypto";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { SignedShareAccessClient } from "./SignedShareAccessClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Доступ к подписанному документу — JURO",
  robots: { index: false, follow: false, nocache: true },
};

interface SignedShareRecord {
  expiresAt: string;
  deactivatedAt: string | null;
  deletedAt: string | null;
  archivedAt: string | null;
}

export default async function SignedSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = await sha256(token);
  let record: SignedShareRecord | null = null;
  try {
    record = await requireD1().prepare(
      `SELECT s.expires_at AS expiresAt, s.deactivated_at AS deactivatedAt,
       s.deleted_at AS deletedAt, f.archived_at AS archivedAt
       FROM standalone_signed_pdf_shares s JOIN document_files f ON f.id = s.file_id
       WHERE s.token_hash = ? LIMIT 1`,
    ).bind(hash).first<SignedShareRecord>();
  } catch {
    record = null;
  }
  if (!record || Boolean(record.deletedAt) || record.expiresAt <= new Date().toISOString()) return <main className="dbt-public-message"><img src="/juro-logo-primary.png" alt="JURO"/><h1>Срок действия ссылки истёк</h1><p>Доступ к этому файлу больше не предоставляется.</p></main>;
  if (record.deactivatedAt || record.archivedAt) return <main className="dbt-public-message"><img src="/juro-logo-primary.png" alt="JURO"/><h1>Доступ запрещён</h1><p>Владелец файла закрыл доступ.</p></main>;
  return <SignedShareAccessClient token={token}/>;
}
