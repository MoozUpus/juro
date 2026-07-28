import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createIdentityProtectionContext } from "../lib/auth/identity-protection";
import {
  handleOnboardingRequest,
  onboardingRedirect,
  type OnboardingInput,
} from "../lib/platform/onboarding";
import { registrationPolicies } from "../lib/legal/policies";

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  first<T>(): T | null {
    return (this.database.prepare(this.sql).get(
      ...this.bindings(),
    ) as T | undefined) ?? null;
  }

  all<T>(): {
    results: T[];
    success: true;
    meta: { changes: number };
  } {
    return {
      results: this.database.prepare(this.sql).all(
        ...this.bindings(),
      ) as T[],
      success: true,
      meta: { changes: 0 },
    };
  }

  execute<T>(): {
    results: T[];
    success: true;
    meta: { changes: number };
  } {
    const statement = this.database.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql)) {
      const results = statement.all(...this.bindings()) as T[];
      const changes = Number((
        this.database.prepare("SELECT changes() AS value").get() as {
          value: number | bigint;
        }
      ).value);
      return { results, success: true, meta: { changes } };
    }
    const result = statement.run(...this.bindings());
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }

  private bindings(): Array<null | number | bigint | string> {
    return this.values as Array<null | number | bigint | string>;
  }
}

function onboardingDatabase(): {
  sqlite: DatabaseSync;
  d1: D1Database;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE user_profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_ciphertext TEXT,
      email_iv TEXT,
      email_key_version TEXT,
      email_lookup_hash TEXT,
      email_lookup_key_version TEXT,
      phone TEXT,
      phone_ciphertext TEXT,
      phone_iv TEXT,
      phone_key_version TEXT,
      phone_lookup_hash TEXT,
      phone_lookup_key_version TEXT,
      last_name TEXT,
      first_name TEXT,
      middle_name TEXT,
      full_name TEXT,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      phone_verified_at TEXT,
      locale TEXT NOT NULL DEFAULT 'ru',
      account_type TEXT NOT NULL DEFAULT 'individual',
      company_name TEXT,
      organization_role TEXT,
      primary_goal TEXT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Tashkent',
      default_workspace_id TEXT,
      onboarding_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id,user_id)
    );
    CREATE TABLE workspace_audit_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_user_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE policy_documents (
      id TEXT PRIMARY KEY,
      document_key TEXT NOT NULL,
      document_version TEXT NOT NULL,
      locale TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE user_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      policy_document_id TEXT,
      document_key TEXT NOT NULL,
      document_version TEXT NOT NULL,
      locale TEXT,
      content_sha256 TEXT,
      acceptance_method TEXT,
      auth_source TEXT,
      accepted_at TEXT NOT NULL
    );
    CREATE TABLE consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL
    );
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) =>
          (statement as unknown as SqliteD1Statement).execute()
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

function insertProfile(
  sqlite: DatabaseSync,
  input: {
    userId?: string;
    accountType?: string;
    workspaceType?: "individual" | "business";
  } = {},
): string {
  const userId = input.userId ?? "onboarding-user";
  const workspaceType = input.workspaceType ?? "business";
  const workspaceId = `${workspaceType}-workspace`;
  const createdAt = "2026-07-28T00:00:00.000Z";
  sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,account_type,company_name,organization_role,
       default_workspace_id,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?, ?,?)`,
  ).run(
    userId,
    `${userId}@example.test`,
    "ru",
    input.accountType ?? workspaceType,
    workspaceType === "business" ? "Legacy Business" : null,
    workspaceType === "business" ? "owner" : null,
    workspaceId,
    createdAt,
    createdAt,
  );
  sqlite.prepare(
    `INSERT INTO workspaces (
       id,type,name,locale,created_at,updated_at
     ) VALUES (?,?,?,?,?,?)`,
  ).run(
    workspaceId,
    workspaceType,
    workspaceType === "business" ? "Legacy Business" : "Personal",
    "ru",
    createdAt,
    createdAt,
  );
  sqlite.prepare(
    `INSERT INTO workspace_members (
       id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    `member-${userId}`,
    workspaceId,
    userId,
    "owner",
    "active",
    createdAt,
    createdAt,
    createdAt,
  );
  return userId;
}

async function insertPolicyEvidence(
  sqlite: DatabaseSync,
  userId: string,
  locale: "ru" | "uz",
  count?: number,
): Promise<void> {
  const policies = (await registrationPolicies(locale)).slice(0, count);
  for (const policy of policies) {
    sqlite.prepare(
      `INSERT INTO policy_documents (
         id,document_key,document_version,locale,content_sha256,status
       ) VALUES (?,?,?,?,?,?)`,
    ).run(
      policy.id,
      policy.documentKey,
      policy.documentVersion,
      policy.locale,
      policy.contentSha256,
      policy.status,
    );
    sqlite.prepare(
      `INSERT INTO user_acceptances (
         id,user_id,policy_document_id,document_key,document_version,locale,
         content_sha256,acceptance_method,auth_source,accepted_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      `acceptance-${policy.documentKey}`,
      userId,
      policy.id,
      policy.documentKey,
      policy.documentVersion,
      policy.locale,
      policy.contentSha256,
      "registration_checkbox",
      "email_otp",
      "2026-07-28T00:00:00.000Z",
    );
  }
}

const validInput: OnboardingInput = {
  lastName: "Karimov",
  firstName: "Sardor",
  middleName: "Akmalovich",
  phone: "+998901234567",
  locale: "ru",
  accountPersona: "lawyer",
  primaryGoal: "professional_work",
};

function request(body: unknown): Request {
  return new Request("https://app.juro.uz/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function dependencies(
  d1: D1Database,
  userId = "onboarding-user",
) {
  return {
    db: d1,
    identityContext: createIdentityProtectionContext("legacy", null),
    userId,
    now: "2026-07-28T12:00:00.000Z",
  };
}

test("onboarding API rejects unknown fields and bodies over 4 KiB", async () => {
  const unreachable = {} as D1Database;
  const unknown = await handleOnboardingRequest(
    request({ ...validInput, admin: true }),
    dependencies(unreachable),
  );
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json() as { code: string }).code, "INVALID_INPUT");

  const oversized = await handleOnboardingRequest(
    request({ ...validInput, firstName: "x".repeat(4_096) }),
    dependencies(unreachable),
  );
  assert.equal(oversized.status, 413);
  assert.equal(
    (await oversized.json() as { code: string }).code,
    "PAYLOAD_TOO_LARGE",
  );
});

test("RU onboarding stores split names and normalized phone without broad consent", async () => {
  const { sqlite, d1 } = onboardingDatabase();
  try {
    const userId = insertProfile(sqlite);
    await insertPolicyEvidence(sqlite, userId, "ru");
    const response = await handleOnboardingRequest(
      request({
        ...validInput,
        phone: "90 123-45-67",
      }),
      dependencies(d1, userId),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      accountPersona: "lawyer",
      workspaceId: "ws_personal_onboardinguser",
      redirectTo: "/ru/individual/main",
    });
    const profile = sqlite.prepare(
      `SELECT
         last_name AS lastName,first_name AS firstName,
         middle_name AS middleName,full_name AS fullName,phone,
         phone_verified AS phoneVerified,
         phone_verified_at AS phoneVerifiedAt,locale,
         account_type AS accountPersona,company_name AS companyName,
         organization_role AS organizationRole,
         primary_goal AS primaryGoal,
         default_workspace_id AS workspaceId,
         onboarding_completed_at AS completedAt
       FROM user_profiles WHERE id=?`,
    ).get(userId) as Record<string, unknown>;
    assert.deepEqual({ ...profile }, {
      lastName: "Karimov",
      firstName: "Sardor",
      middleName: "Akmalovich",
      fullName: "Karimov Sardor Akmalovich",
      phone: "+998901234567",
      phoneVerified: 0,
      phoneVerifiedAt: null,
      locale: "ru",
      accountPersona: "lawyer",
      companyName: null,
      organizationRole: null,
      primaryGoal: "professional_work",
      workspaceId: "ws_personal_onboardinguser",
      completedAt: "2026-07-28T12:00:00.000Z",
    });
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS total FROM workspaces WHERE type='individual'",
    ).get() as { total: number }).total, 1);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS total FROM workspaces WHERE type='business'",
    ).get() as { total: number }).total, 1);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS total FROM consents",
    ).get() as { total: number }).total, 0);
    const audit = sqlite.prepare(
      `SELECT metadata_json AS metadata
       FROM workspace_audit_events
       WHERE action='onboarding_completed'`,
    ).get() as { metadata: string };
    assert.deepEqual(JSON.parse(audit.metadata), {
      accountPersona: "lawyer",
      primaryGoal: "professional_work",
      policyEvidence: "registration_digests",
    });
  } finally {
    sqlite.close();
  }
});

test("UZ onboarding reuses the existing personal workspace", async () => {
  const { sqlite, d1 } = onboardingDatabase();
  try {
    const userId = insertProfile(sqlite, {
      accountType: "individual",
      workspaceType: "individual",
    });
    await insertPolicyEvidence(sqlite, userId, "uz");
    const response = await handleOnboardingRequest(
      request({
        lastName: "Yo‘ldoshev",
        firstName: "Otabek",
        middleName: "",
        phone: "00998 (93) 765-43-21",
        locale: "uz",
        accountPersona: "entrepreneur",
        primaryGoal: "manage_case",
      }),
      dependencies(d1, userId),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      accountPersona: "entrepreneur",
      workspaceId: "individual-workspace",
      redirectTo: "/uz/individual/main",
    });
    const profile = sqlite.prepare(
      `SELECT phone,middle_name AS middleName,locale,
         account_type AS accountPersona,primary_goal AS primaryGoal
       FROM user_profiles WHERE id=?`,
    ).get(userId) as Record<string, unknown>;
    assert.deepEqual({ ...profile }, {
      phone: "+998937654321",
      middleName: null,
      locale: "uz",
      accountPersona: "entrepreneur",
      primaryGoal: "manage_case",
    });
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS total FROM workspaces",
    ).get() as { total: number }).total, 1);
  } finally {
    sqlite.close();
  }
});

test("onboarding fails closed when one mandatory policy digest is missing", async () => {
  const { sqlite, d1 } = onboardingDatabase();
  try {
    const userId = insertProfile(sqlite);
    await insertPolicyEvidence(sqlite, userId, "ru", 2);
    const response = await handleOnboardingRequest(
      request(validInput),
      dependencies(d1, userId),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "POLICY_EVIDENCE_REQUIRED",
      error:
        "Не найдены подтверждения обязательных документов. Повторите регистрацию или обратитесь в поддержку.",
    });
    const profile = sqlite.prepare(
      `SELECT onboarding_completed_at AS completedAt
       FROM user_profiles WHERE id=?`,
    ).get(userId) as { completedAt: string | null };
    assert.equal(profile.completedAt, null);
    assert.equal((sqlite.prepare(
      "SELECT count(*) AS total FROM workspaces",
    ).get() as { total: number }).total, 1);
  } finally {
    sqlite.close();
  }
});

test("repeated onboarding creates at most one default personal workspace", async () => {
  const { sqlite, d1 } = onboardingDatabase();
  try {
    const userId = insertProfile(sqlite);
    await insertPolicyEvidence(sqlite, userId, "ru");
    const responses = await Promise.all([
      handleOnboardingRequest(request(validInput), dependencies(d1, userId)),
      handleOnboardingRequest(request(validInput), dependencies(d1, userId)),
    ]);
    assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
    assert.equal((sqlite.prepare(
      `SELECT count(*) AS total
       FROM workspaces workspace
       JOIN workspace_members member ON member.workspace_id=workspace.id
       WHERE workspace.type='individual'
         AND member.user_id=?
       AND member.role='owner'`,
    ).get(userId) as { total: number }).total, 1);
    assert.equal((sqlite.prepare(
      `SELECT count(*) AS total FROM workspace_audit_events
       WHERE action='onboarding_completed'`,
    ).get() as { total: number }).total, 1);
  } finally {
    sqlite.close();
  }
});

test("onboarding UI exposes complete RU/UZ profile and goal contracts", async () => {
  const [client, route] = await Promise.all([
    readFile(
      new URL("../app/onboarding/OnboardingForm.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/onboarding/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  for (const label of [
    "Физическое лицо",
    "Индивидуальный предприниматель",
    "Юрист",
    "Jismoniy shaxs",
    "Yakka tartibdagi tadbirkor",
    "Yurist",
    "Получить юридический ответ",
    "Huquqiy javob olish",
    "Использовать JURO в профессиональной работе",
    "JURO’dan professional ishda foydalanish",
  ]) {
    assert.match(client, new RegExp(label));
  }
  assert.match(client, /autoComplete="family-name"/);
  assert.match(client, /autoComplete="given-name"/);
  assert.match(client, /autoComplete="additional-name"/);
  assert.match(client, /autoComplete="tel"/);
  assert.doesNotMatch(client, /acceptPolicies|onboarding-consent/);
  assert.match(route, /handleOnboardingRequest/);
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.equal(onboardingRedirect("ru"), "/ru/individual/main");
  assert.equal(onboardingRedirect("uz"), "/uz/individual/main");
});
