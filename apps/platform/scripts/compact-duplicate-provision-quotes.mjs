import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const database = "juro-staging";
const environment = "staging";
const batches = Number(process.argv[2] ?? "1");
if (!Number.isSafeInteger(batches) || batches < 1 || batches > 100) {
  throw new Error("Usage: compact-duplicate-provision-quotes.mjs [batches:1..100]");
}

function execute(sql) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", database, "--remote", "--json",
      "--config", "wrangler.legal-corpus.jsonc", "--env", environment, "--command", sql],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || result.error?.message
    || `wrangler exited ${result.status}`);
  return JSON.parse(result.stdout);
}

const immutableTrigger = `CREATE TRIGGER legal_corpus_provisions_immutable_guard
  BEFORE UPDATE ON legal_corpus_provisions FOR EACH ROW
  BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_IMMUTABLE'); END`;
const compactingTrigger = `CREATE TRIGGER legal_corpus_provisions_immutable_guard
  BEFORE UPDATE ON legal_corpus_provisions FOR EACH ROW
  WHEN NEW.exact_quote_source<>'@text' OR OLD.exact_quote_source<>OLD.text
    OR json_array(NEW.id,NEW.document_id,NEW.variant_id,NEW.version_id,NEW.article_number,
      NEW.article_number_normalized,NEW.article_title,NEW.part,NEW.chapter,NEW.section,
      NEW.sequence,NEW.text,NEW.language,NEW.status,NEW.valid_from,NEW.valid_to,
      NEW.source_url,NEW.content_sha256,NEW.created_at)
      <>json_array(OLD.id,OLD.document_id,OLD.variant_id,OLD.version_id,OLD.article_number,
      OLD.article_number_normalized,OLD.article_title,OLD.part,OLD.chapter,OLD.section,
      OLD.sequence,OLD.text,OLD.language,OLD.status,OLD.valid_from,OLD.valid_to,
      OLD.source_url,OLD.content_sha256,OLD.created_at)
  BEGIN SELECT RAISE(ABORT, 'LEGAL_CORPUS_PROVISION_IMMUTABLE'); END`;

execute(`DROP TRIGGER legal_corpus_provisions_immutable_guard; ${compactingTrigger}`);
try {
  for (let index = 0; index < batches; index += 1) {
    const packet = execute(`UPDATE legal_corpus_provisions SET exact_quote_source='@text'
      WHERE id IN (SELECT id FROM legal_corpus_provisions
        WHERE exact_quote_source=text AND exact_quote_source<>'@text' LIMIT 10000)`);
    const result = Array.isArray(packet) ? packet[0] : packet;
    const changes = Number(result?.meta?.changes ?? 0);
    process.stdout.write(`${JSON.stringify({ batch: index + 1, changes })}\n`);
    if (changes === 0) break;
  }
} finally {
  execute(`DROP TRIGGER legal_corpus_provisions_immutable_guard; ${immutableTrigger}`);
}
