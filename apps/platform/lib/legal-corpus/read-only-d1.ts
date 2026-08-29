const READ_QUERY_PREFIX = /^\s*(?:SELECT|WITH)\b/iu;
const SQL_COMMENT = /(?:--|\/\*)/u;
const STATEMENT_SEPARATOR = /;/u;
const MUTATING_SQL_KEYWORD = /\b(?:ALTER|ANALYZE|ATTACH|CREATE|DELETE|DETACH|DROP|INSERT|PRAGMA|REINDEX|REPLACE|TRUNCATE|UPDATE|VACUUM)\b/iu;

export class LegalCorpusReadOnlyDatabaseError extends TypeError {
  readonly code = "LEGAL_CORPUS_READ_ONLY_DATABASE";

  constructor(message = "The staging legal corpus binding permits read queries only.") {
    super(message);
    this.name = "LegalCorpusReadOnlyDatabaseError";
  }
}

function rejectWrite(message?: string): never {
  throw new LegalCorpusReadOnlyDatabaseError(message);
}

function assertReadQuery(query: string): void {
  if (
    !READ_QUERY_PREFIX.test(query)
    || SQL_COMMENT.test(query)
    || STATEMENT_SEPARATOR.test(query)
    || MUTATING_SQL_KEYWORD.test(query)
  ) {
    rejectWrite("Only one comment-free SELECT or read-only WITH query is allowed.");
  }
}

function protectStatement(statement: D1PreparedStatement): D1PreparedStatement {
  return new Proxy(statement, {
    get(target, property) {
      if (property === "run") {
        return () => rejectWrite("D1PreparedStatement.run() is disabled for the staging corpus.");
      }
      if (property === "bind") {
        return (...values: unknown[]) => protectStatement(target.bind(...values));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Narrows a remote D1 binding to the read surface used by corpus retrieval.
 * This is a code-enforced guard, not a Cloudflare IAM boundary: the Vite-only
 * binding must never be passed to migrations, ingestion, jobs, or app storage.
 */
export function createReadOnlyLegalCorpusDatabase(database: D1Database): D1Database {
  return new Proxy(database, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          assertReadQuery(query);
          return protectStatement(target.prepare(query));
        };
      }
      if (
        property === "batch"
        || property === "exec"
        || property === "withSession"
        || property === "dump"
      ) {
        return () => rejectWrite(`D1Database.${String(property)}() is disabled for the staging corpus.`);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
