import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("0063 is additive and establishes immutable client acceptance plus one payable per allocation", () => {
  const sql = readFileSync(new URL("../drizzle/0063_marketplace_service_payments.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
  for (const table of ["legal_service_proposals", "legal_service_proposal_versions", "proposal_acceptances", "order_agreements", "order_consents", "settlement_allocations", "lawyer_payables"]) {
    assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(sql, /marketplace_commission_rate_basis_points/);
  assert.match(sql, /legal_service_proposal_versions_immutable_update/);
  assert.match(sql, /proposal_acceptances_immutable_update/);
  assert.match(sql, /lawyer_payables_allocation_uidx/);
  assert.match(sql, /settlement_allocations_order_idempotency_uidx/);
});

test("marketplace source keeps consent, pricing and payout control points server-side", () => {
  const service = readFileSync(new URL("../lib/billing/marketplace-service.ts", import.meta.url), "utf8");
  const finalizer = readFileSync(new URL("../lib/billing/marketplace-payment-finalization.ts", import.meta.url), "utf8");
  assert.match(service, /proposal_acceptances/);
  assert.match(service, /tax_components/);
  assert.match(service, /marketplaceCommissionRateBasisPoints/);
  assert.match(finalizer, /payment_provider_events/);
  assert.match(finalizer, /settlement_allocations/);
  assert.match(finalizer, /lawyer_payables/);
  assert.match(finalizer, /buildCapturedPaymentLedger/);
});

test("marketplace staging seed is synthetic, idempotent, and keeps the 10% rate configuration-only", () => {
  const seed = readFileSync(new URL("../scripts/staging-marketplace-payment-seed.sql", import.meta.url), "utf8");
  assert.match(seed, /SYNTHETIC STAGING FIXTURE ONLY/);
  assert.match(seed, /Never execute against production/);
  assert.match(seed, /INSERT OR IGNORE INTO pricing_policy_versions/);
  assert.match(seed, /marketplace_commission_rate_basis_points/);
  assert.match(seed, /1000/);
  assert.doesNotMatch(seed, /INSERT\s+INTO\s+(?:marketplace_orders|payment_attempts|lawyer_payables)/i);
});

test("marketplace proposal UI uses the protected proposal endpoints and supports personal and business checkout routes", () => {
  const flow = readFileSync(new URL("../app/_platform/MarketplaceServiceProposalFlow.tsx", import.meta.url), "utf8");
  const lawyer = readFileSync(new URL("../app/_platform/LawyerRequestsClient.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/_platform/LawyerHandoffClient.tsx", import.meta.url), "utf8");
  const personalCheckout = readFileSync(new URL("../app/[locale]/[accountType]/cases/[caseId]/proposals/[proposalId]/checkout/page.tsx", import.meta.url), "utf8");
  const businessCheckout = readFileSync(new URL("../app/[locale]/business/[workspaceId]/cases/[caseId]/proposals/[proposalId]/checkout/page.tsx", import.meta.url), "utf8");
  for (const endpoint of ["/proposals`, {", "/accept`, {", "/checkout`, {"]) assert.match(flow, new RegExp(endpoint.replace(/[{}]/g, "\\$&")));
  assert.match(flow, /x-juro-csrf/);
  assert.match(flow, /accepted: true/);
  assert.match(flow, /platformBasePath/);
  assert.match(lawyer, /LawyerServiceProposalForm/);
  assert.match(client, /ClientServiceProposals/);
  assert.match(personalCheckout, /MarketplaceProposalCheckoutClient/);
  assert.match(businessCheckout, /MarketplaceProposalCheckoutClient/);
  assert.match(businessCheckout, /accountType="business"/);
});

test("business proposal flows resolve the route workspace server-side and never trust it as an access grant", () => {
  const listRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/route.ts", import.meta.url), "utf8");
  const acceptRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/[proposalId]/accept/route.ts", import.meta.url), "utf8");
  const checkoutRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/[proposalId]/checkout/route.ts", import.meta.url), "utf8");
  const flow = readFileSync(new URL("../app/_platform/MarketplaceServiceProposalFlow.tsx", import.meta.url), "utf8");
  for (const route of [listRoute, acceptRoute, checkoutRoute]) {
    assert.match(route, /workspaceForUserById/);
    assert.match(route, /WORKSPACE_UNAVAILABLE/);
  }
  assert.match(listRoute, /requestedWorkspaceId/);
  assert.match(listRoute, /client_user_id=\?/);
  assert.match(acceptRoute, /client_user_id=\?/);
  assert.match(checkoutRoute, /owner_user_id=\?/);
  assert.match(flow, /\?workspaceId=\$\{encodeURIComponent\(workspaceId\)\}/);
  assert.match(flow, /\.\.\.\(workspaceId \? \{ workspaceId \} : \{\}\)/);
});

test("proposal acceptance keeps explicit consent immutable while making same-version retries safe", () => {
  const acceptRoute = readFileSync(new URL("../app/api/cases/[caseId]/proposals/[proposalId]/accept/route.ts", import.meta.url), "utf8");
  assert.match(acceptRoute, /proposal_acceptances/);
  assert.match(acceptRoute, /existingAcceptance/);
  assert.match(acceptRoute, /replayed: true/);
  assert.match(acceptRoute, /PROPOSAL_ALREADY_ACCEPTED/);
  assert.match(acceptRoute, /workspaceForUserById/);
});
