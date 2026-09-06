import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmMarketplaceServiceCheckout,
  createMarketplaceServiceCheckout,
} from "../lib/billing/marketplace-service";
import { BillingDomainError } from "../lib/billing/checkout-service";
import { finalizeSandboxPayment } from "../lib/billing/payment-finalization";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const NOW = "2026-08-03T10:00:00.000Z";
const ids = {
  client: "11111111-1111-4111-8111-111111111111",
  lawyer: "22222222-2222-4222-8222-222222222222",
  workspace: "33333333-3333-4333-8333-333333333333",
  case: "44444444-4444-4444-8444-444444444444",
  profile: "55555555-5555-4555-8555-555555555555",
  request: "66666666-6666-4666-8666-666666666666",
  proposal: "77777777-7777-4777-8777-777777777777",
  acceptance: "88888888-8888-4888-8888-888888888888",
  policy: "99999999-9999-4999-8999-999999999999",
  policyVersion: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  lawyerTax: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  juroTax: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function seedMarketplace() {
  const fixture = sqliteD1Fixture();
  const { sqlite } = fixture;
  sqlite.prepare("INSERT INTO user_profiles(id,email,locale,account_type,created_at,updated_at) VALUES (?,?,'ru',?,?,?)")
    .run(ids.client, "client-marketplace@example.test", "individual", NOW, NOW);
  sqlite.prepare("INSERT INTO user_profiles(id,email,locale,account_type,created_at,updated_at) VALUES (?,?,'ru',?,?,?)")
    .run(ids.lawyer, "lawyer-marketplace@example.test", "lawyer", NOW, NOW);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,locale,created_at,updated_at) VALUES (?,'individual','Client test','ru',?,?)")
    .run(ids.workspace, NOW, NOW);
  sqlite.prepare("INSERT INTO cases(id,workspace_id,owner_user_id,account_type,locale,title,description,legal_area,status,current_revision,created_at,updated_at) VALUES (?,?,?,'individual','ru','Договор',NULL,'contracts','open',1,?,?)")
    .run(ids.case, ids.workspace, ids.client, NOW, NOW);
  sqlite.prepare("INSERT INTO lawyer_profiles(id,user_id,display_name,specialties_json,languages_json,status,availability_status,advocate_status,created_at,updated_at) VALUES (?,?,?,'[]','[\"ru\"]','public_approved','available','declared',?,?)")
    .run(ids.profile, ids.lawyer, "Тестовый юрист", NOW, NOW);
  sqlite.prepare("INSERT INTO lawyer_requests(id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at) VALUES (?,?,?,?,?,'service_proposal_proposed','{}','{}',?,?)")
    .run(ids.request, ids.workspace, ids.case, ids.client, ids.profile, NOW, NOW);
  sqlite.prepare("INSERT INTO legal_service_proposals(id,external_id,lawyer_request_id,case_id,workspace_id,client_user_id,lawyer_profile_id,lawyer_user_id,version,status,title_ru,title_uz,title_en,scope_ru,scope_uz,scope_en,duration_description,duration_description_en,lawyer_base_amount_minor,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,'ACCEPTED','Анализ договора','Shartnomani tahlil qilish','Contract review','Проверка и письменное заключение','Tekshiruv va yozma xulosa','Review and written opinion','2 рабочих дня','2 business days',1000000,'UZS',?,?)")
    .run(ids.proposal, "proposal_test_1", ids.request, ids.case, ids.workspace, ids.client, ids.profile, ids.lawyer, NOW, NOW);
  sqlite.prepare("INSERT INTO proposal_acceptances(id,proposal_id,client_user_id,workspace_id,agreement_version,agreement_sha256,consent_scope_json,accepted_at,created_at) VALUES (?,?,?,?,?,?,'{}',?,?)")
    .run(ids.acceptance, ids.proposal, ids.client, ids.workspace, "2026-08-03", "d".repeat(64), NOW, NOW);
  sqlite.prepare("INSERT INTO pricing_policies(id,code,name,status,created_at,updated_at) VALUES (?,?,'Marketplace standard','approved',?,?)")
    .run(ids.policy, "marketplace_service_standard", NOW, NOW);
  sqlite.prepare("INSERT INTO pricing_policy_versions(id,policy_id,version,currency,provider_commission_rate_basis_points,vat_rate_basis_points,provider_fee_bearer,basis,effective_from,approval_status,approved_by_user_id,approved_at,created_by_user_id,created_at,marketplace_commission_rate_basis_points) VALUES (?,?,1,'UZS',0,1200,'PLATFORM_ABSORBS','marketplace',?,'approved',?,?,?, ?,1000)")
    .run(ids.policyVersion, ids.policy, NOW, ids.client, NOW, ids.client, NOW);
  sqlite.prepare("INSERT INTO tax_profiles(id,subject_type,subject_id,service_type,payer_status,tax_model,vat_rate_basis_points,effective_from,approval_status,approved_by_user_id,approved_at,version,created_at,updated_at) VALUES (?,'LAWYER',?,'LEGAL_SERVICE','VAT_PAYER','VAT_ON_GROSS',1200,?,'approved',?,?,1,?,?)")
    .run(ids.lawyerTax, ids.profile, NOW, ids.client, NOW, NOW, NOW);
  sqlite.prepare("INSERT INTO tax_profiles(id,subject_type,subject_id,service_type,payer_status,tax_model,vat_rate_basis_points,effective_from,approval_status,approved_by_user_id,approved_at,version,created_at,updated_at) VALUES (?,'PLATFORM','JURO','MARKETPLACE_SERVICE','VAT_PAYER','VAT_ON_PLATFORM_REVENUE_ONLY',1200,?,'approved',?,?,1,?,?)")
    .run(ids.juroTax, NOW, ids.client, NOW, NOW, NOW);
  return fixture;
}

test("marketplace legal-service payment creates exactly one allocation and payable after verified funding", async () => {
  const { sqlite, d1 } = seedMarketplace();
  try {
    const actor = { userId: ids.client, workspaceId: ids.workspace };
    const created = await createMarketplaceServiceCheckout(
      d1,
      actor,
      { proposalId: ids.proposal, requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      new Date(NOW),
    );
    const replayedCreate = await createMarketplaceServiceCheckout(
      d1,
      actor,
      { proposalId: ids.proposal, requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      new Date("2026-08-03T10:00:01.000Z"),
    );
    assert.equal(created.order.id, replayedCreate.order.id);
    assert.equal(created.order.orderType, "LEGAL_SERVICE");
    assert.equal(created.pricingSnapshot?.clientTotalMinor, 1_232_000);
    assert.equal(created.items[0]?.titleEn, "Contract review");

    const confirmed = await confirmMarketplaceServiceCheckout(
      d1,
      actor,
      String(created.order.id),
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "/ru/individual/orders/test/payment",
      new Date("2026-08-03T10:01:00.000Z"),
    );
    const replayedConfirm = await confirmMarketplaceServiceCheckout(
      d1,
      actor,
      String(created.order.id),
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "/ru/individual/orders/test/payment",
      new Date("2026-08-03T10:01:01.000Z"),
    );
    assert.equal(confirmed.paymentAttempt?.id, replayedConfirm.paymentAttempt?.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_attempts").get()?.count, 1);
    const event = {
      eventId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      type: "payment.funded" as const,
      providerAttemptId: String(confirmed.paymentAttempt?.providerAttemptId),
      amountMinor: Number(confirmed.paymentAttempt?.amountMinor),
      currency: "UZS" as const,
      occurredAt: "2026-08-03T10:02:00.000Z",
    };
    const funded = await finalizeSandboxPayment(d1, event, JSON.stringify(event), new Date(event.occurredAt));
    const replay = await finalizeSandboxPayment(d1, event, JSON.stringify(event), new Date("2026-08-03T10:02:01.000Z"));
    assert.equal(funded.orderStatus, "ACTIVE");
    assert.equal(replay.replay, true);
    assert.equal(sqlite.prepare("SELECT status FROM legal_service_proposals WHERE id=?").get(ids.proposal)?.status, "FUNDED");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM settlement_allocations").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lawyer_payables WHERE status='PENDING_SETTLEMENT'").get()?.count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payments").get()?.count, 1);
    const ledger = sqlite.prepare("SELECT status,debit_total_minor AS debit,credit_total_minor AS credit FROM ledger_transactions").get() as { status: string; debit: number; credit: number };
    assert.equal(ledger.status, "posted");
    assert.equal(ledger.debit, ledger.credit);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_provider_events").get()?.count, 1);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("marketplace checkout allows one active attempt, rejects a distinct concurrent confirmation, and hides the order from another workspace", async () => {
  const { sqlite, d1 } = seedMarketplace();
  try {
    const actor = { userId: ids.client, workspaceId: ids.workspace };
    const checkout = await createMarketplaceServiceCheckout(
      d1,
      actor,
      { proposalId: ids.proposal, requestId: "12121212-1212-4121-8121-121212121212" },
      new Date(NOW),
    );
    const orderId = String(checkout.order.id);
    const [first, second] = await Promise.allSettled([
      confirmMarketplaceServiceCheckout(
        d1,
        actor,
        orderId,
        "13131313-1313-4131-8131-131313131313",
        "/ru/individual/orders/test/payment",
        new Date("2026-08-03T10:01:00.000Z"),
      ),
      confirmMarketplaceServiceCheckout(
        d1,
        actor,
        orderId,
        "14141414-1414-4141-8141-141414141414",
        "/ru/individual/orders/test/payment",
        new Date("2026-08-03T10:01:00.000Z"),
      ),
    ]);
    assert.equal([first, second].filter((result) => result.status === "fulfilled").length, 1);
    assert.equal([first, second].filter((result) => result.status === "rejected").length, 1);
    const rejected = first.status === "rejected" ? first.reason : second.status === "rejected" ? second.reason : null;
    assert.ok(rejected instanceof BillingDomainError);
    assert.ok(["ORDER_CONFIRMATION_CONFLICT", "ORDER_NOT_CONFIRMABLE"].includes(rejected.code));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_attempts WHERE order_id=? AND internal_status='client_action_required'").get(orderId)?.count, 1);

    await assert.rejects(
      confirmMarketplaceServiceCheckout(
        d1,
        { userId: ids.client, workspaceId: "99999999-9999-4999-8999-999999999998" },
        orderId,
        "15151515-1515-4151-8151-151515151515",
        "/ru/individual/orders/test/payment",
        new Date("2026-08-03T10:02:00.000Z"),
      ),
      (error: unknown) => error instanceof BillingDomainError && error.code === "ORDER_UNAVAILABLE",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});
