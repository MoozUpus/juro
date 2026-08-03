import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function statements(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE user_profiles (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_ends_at TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE payments (id TEXT PRIMARY KEY);
  `);
  const sql = readFileSync(new URL("../drizzle/0061_cheerful_christian_walker.sql", import.meta.url), "utf8");
  for (const statement of statements(sql)) db.exec(statement);
  db.prepare("INSERT INTO user_profiles(id,created_at) VALUES (?,?)").run("user-1", "2026-08-03T00:00:00.000Z");
  db.prepare("INSERT INTO workspaces(id) VALUES (?)").run("workspace-1");
  return db;
}

test("0061 is additive and contains financial immutability/replay guards", () => {
  const sql = readFileSync(new URL("../drizzle/0061_cheerful_christian_walker.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  for (const table of [
    "marketplace_orders",
    "pricing_snapshots",
    "subscription_plan_versions",
    "subscription_invoices",
    "payment_attempts",
    "payment_provider_events",
    "ledger_accounts",
    "ledger_transactions",
    "ledger_entries",
  ]) assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  assert.match(sql, /PRICING_SNAPSHOT_IMMUTABLE/);
  assert.match(sql, /LEDGER_TRANSACTION_UNBALANCED/);
  assert.match(sql, /POSTED_LEDGER_ENTRY_IMMUTABLE/);
});

test("0061 freezes accepted pricing and enforces order idempotency", () => {
  const db = database();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    db.prepare("INSERT INTO pricing_policies(id,code,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .run("policy-1", "subscription", "Subscription pricing", "approved", now, now);
    db.prepare(`INSERT INTO pricing_policy_versions(
      id,policy_id,version,currency,provider_commission_rate_basis_points,vat_rate_basis_points,
      provider_fee_bearer,basis,effective_from,approval_status,created_by_user_id,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "policy-version-1", "policy-1", 1, "UZS", 0, 1200,
      "PLATFORM_ABSORBS", "approved subscription policy", now, "approved", "user-1", now,
    );
    db.prepare(`INSERT INTO marketplace_orders(
      id,external_id,workspace_id,customer_user_id,order_type,status,currency,total_amount_minor,
      idempotency_key,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,'PRICED','UZS',0,?,1,?,?)`).run(
      "order-1", "order-ext-1", "workspace-1", "user-1", "SUBSCRIPTION", "checkout-1", now, now,
    );
    assert.throws(() => db.prepare(`INSERT INTO marketplace_orders(
      id,external_id,workspace_id,customer_user_id,order_type,status,currency,total_amount_minor,
      idempotency_key,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,'DRAFT','UZS',0,?,1,?,?)`).run(
      "order-2", "order-ext-2", "workspace-1", "user-1", "SUBSCRIPTION", "checkout-1", now, now,
    ), /UNIQUE/);

    db.prepare(`INSERT INTO pricing_snapshots(
      id,order_id,version,lawyer_base_amount_minor,lawyer_vat_amount_minor,lawyer_gross_amount_minor,
      juro_base_amount_minor,juro_vat_amount_minor,juro_gross_amount_minor,subscription_credit_minor,
      discount_amount_minor,provider_commission_rate_basis_points,provider_commission_base_minor,
      provider_commission_amount_minor,provider_commission_allocation_json,client_total_minor,
      expected_provider_settlement_minor,lawyer_expected_payout_minor,juro_expected_revenue_minor,
      currency,tax_policy_version_id,pricing_policy_version_id,calculation_hash,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "snapshot-1", "order-1", 1, 0, 0, 0, 1_000_000, 120_000, 1_120_000, 0,
      0, 0, 1_120_000, 0, "{}", 1_120_000, 1_120_000, 0, 1_000_000,
      "UZS", "tax-policy-1", "policy-version-1", "a".repeat(64), now,
    );
    assert.throws(() => db.prepare("UPDATE pricing_snapshots SET client_total_minor=1 WHERE id='snapshot-1'").run(), /PRICING_SNAPSHOT_IMMUTABLE/);
    assert.throws(() => db.prepare("UPDATE marketplace_orders SET accepted_pricing_snapshot_id='snapshot-1',total_amount_minor=1 WHERE id='order-1'").run(), /ORDER_PRICING_SNAPSHOT_MISMATCH/);
    db.prepare("UPDATE marketplace_orders SET accepted_pricing_snapshot_id='snapshot-1',total_amount_minor=1120000,status='AWAITING_PAYMENT' WHERE id='order-1'").run();
    assert.throws(() => db.prepare("UPDATE marketplace_orders SET accepted_pricing_snapshot_id=NULL WHERE id='order-1'").run(), /ORDER_PRICING_SNAPSHOT_IMMUTABLE/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0061 posts only balanced ledger transactions and freezes posted entries", () => {
  const db = database();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    db.prepare("INSERT INTO ledger_accounts(id,owner_type,owner_id,code,currency,status,created_at) VALUES (?,?,?,?,?,?,?)")
      .run("cash", "platform", "JURO", "BANK_CASH", "UZS", "active", now);
    db.prepare("INSERT INTO ledger_accounts(id,owner_type,owner_id,code,currency,status,created_at) VALUES (?,?,?,?,?,?,?)")
      .run("revenue", "platform", "JURO", "SUBSCRIPTION_REVENUE", "UZS", "active", now);
    db.prepare(`INSERT INTO ledger_transactions(
      id,external_id,workspace_id,transaction_type,status,idempotency_key,currency,
      debit_total_minor,credit_total_minor,occurred_at,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "tx-1", "tx-ext-1", "workspace-1", "payment_capture", "draft", "payment-1", "UZS",
      0, 0, now, 1, now, now,
    );
    db.prepare("INSERT INTO ledger_entries(id,transaction_id,account_id,sequence,side,amount_minor,currency,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("entry-1", "tx-1", "cash", 1, "DEBIT", 1000, "UZS", "cash", now);
    db.prepare("INSERT INTO ledger_entries(id,transaction_id,account_id,sequence,side,amount_minor,currency,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("entry-2", "tx-1", "revenue", 2, "CREDIT", 999, "UZS", "revenue", now);
    assert.throws(() => db.prepare("UPDATE ledger_transactions SET status='posted',debit_total_minor=1000,credit_total_minor=1000,posted_at=? WHERE id='tx-1'").run(now), /LEDGER_TRANSACTION_UNBALANCED/);
    db.prepare("UPDATE ledger_entries SET amount_minor=1000 WHERE id='entry-2'").run();
    db.prepare("UPDATE ledger_transactions SET status='posted',debit_total_minor=1000,credit_total_minor=1000,posted_at=? WHERE id='tx-1'").run(now);
    assert.throws(() => db.prepare("UPDATE ledger_entries SET amount_minor=999 WHERE id='entry-2'").run(), /POSTED_LEDGER_ENTRY_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM ledger_transactions WHERE id='tx-1'").run(), /POSTED_LEDGER_TRANSACTION_IMMUTABLE/);
  } finally {
    db.close();
  }
});

test("the synthetic staging fixture is explicit, zero-tax and idempotent", () => {
  const db = database();
  try {
    const sql = readFileSync(new URL("../scripts/staging-payment-foundation-seed.sql", import.meta.url), "utf8");
    assert.match(sql, /SYNTHETIC STAGING FIXTURE ONLY/);
    assert.match(sql, /Never execute against production/);
    db.exec(sql);
    db.exec(sql);
    const plan = db.prepare("SELECT price_minor AS priceMinor,approval_status AS approvalStatus FROM subscription_plan_versions WHERE id=?")
      .get("12000000-0000-4000-8000-000000000005") as { priceMinor: number; approvalStatus: string };
    const tax = db.prepare("SELECT vat_rate_basis_points AS vatRate,tax_model AS taxModel FROM tax_profiles WHERE id=?")
      .get("12000000-0000-4000-8000-000000000003") as { vatRate: number; taxModel: string };
    assert.equal(plan.priceMinor, 1_000_000);
    assert.equal(plan.approvalStatus, "approved");
    assert.equal(tax.vatRate, 0);
    assert.match(tax.taxModel, /SYNTHETIC_STAGING_ONLY/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM subscription_plan_versions").get()?.count, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
