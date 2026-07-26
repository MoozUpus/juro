import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type SqliteBinding = null | number | bigint | string;

class SqliteStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.database, this.sql, values);
  }

  private bindings(): SqliteBinding[] {
    return this.values.map((value) => {
      if (
        value === null
        || typeof value === "number"
        || typeof value === "bigint"
        || typeof value === "string"
      ) return value;
      throw new TypeError("Unsupported test binding.");
    });
  }

  execute<T>() {
    const statement = this.database.prepare(this.sql);
    if (
      /^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(this.sql)
      || /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = statement.all(...this.bindings()) as T[];
      const changes = Number((
        this.database.prepare("SELECT changes() AS value").get() as {
          value: number | bigint;
        }
      ).value);
      return {
        results,
        success: true as const,
        meta: { changes },
      };
    }
    const result = statement.run(...this.bindings());
    return {
      results: [] as T[],
      success: true as const,
      meta: { changes: Number(result.changes) },
    };
  }

  async first<T>(): Promise<T | null> {
    return (
      this.database.prepare(this.sql).get(...this.bindings()) as T | undefined
    ) ?? null;
  }

  async all<T>() {
    return this.execute<T>();
  }

  async run<T>() {
    return this.execute<T>();
  }
}

const drizzleRoot = new URL("../../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
) as { entries: Array<{ tag: string }> };

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function sqliteD1Fixture(): {
  sqlite: DatabaseSync;
  d1: D1Database;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    const sql = readFileSync(
      new URL(`${entry.tag}.sql`, drizzleRoot),
      "utf8",
    );
    for (const statement of statements(sql)) sqlite.exec(statement);
  }
  const d1 = {
    prepare(sql: string) {
      return new SqliteStatement(sqlite, sql);
    },
    async batch(batchStatements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = batchStatements.map((statement) =>
          (statement as unknown as SqliteStatement).execute()
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

export function batchBarrier(
  db: D1Database,
  participants = 2,
): D1Database {
  let arrived = 0;
  let release: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    prepare: db.prepare.bind(db),
    async batch(batchStatements: D1PreparedStatement[]) {
      arrived += 1;
      if (arrived >= participants) release?.();
      else await ready;
      return db.batch(batchStatements);
    },
  } as unknown as D1Database;
}
