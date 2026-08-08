import assert from "node:assert/strict";
import test from "node:test";
import { buildCapturedPaymentLedger, balanceLedgerEntries } from "../lib/billing/ledger";
import { allocateProRata, applyBasisPoints } from "../lib/billing/money";
import { calculatePricing } from "../lib/billing/pricing";

const baseInput = {
  currency: "UZS" as const,
  lawyerBaseAmountMinor: 600_000,
  lawyerVatRateBasisPoints: 0,
  juroBaseAmountMinor: 400_000,
  juroVatRateBasisPoints: 1_200,
  subscriptionCreditMinor: 0,
  discountAmountMinor: 0,
  providerCommissionRateBasisPoints: 1_000,
  providerFeeBearer: "PLATFORM_AND_LAWYER_PRO_RATA" as const,
  taxPolicyVersionId: "tax-v1",
  pricingPolicyVersionId: "pricing-v1",
  calculatedAt: "2026-08-03T00:00:00.000Z",
};

test("money helpers use deterministic integer rounding and exact pro-rata totals", () => {
  assert.equal(applyBasisPoints(101, 1_000), 10);
  assert.equal(applyBasisPoints(105, 1_000), 11);
  assert.deepEqual(allocateProRata(100_001, 600_000, 400_000), {
    lawyerMinor: 60_000,
    platformMinor: 40_001,
  });
  assert.throws(() => applyBasisPoints(10.5, 1_000), /SAFE_INTEGER/);
  assert.throws(() => allocateProRata(1, 0, 0), /ALLOCATION_BASE_REQUIRED/);
});

test("pricing calculates VAT by provider component and preserves commission equality", () => {
  const pricing = calculatePricing(baseInput);
  assert.equal(pricing.lawyerVatAmountMinor, 0);
  assert.equal(pricing.juroVatAmountMinor, 48_000);
  assert.equal(pricing.clientTotalMinor, 1_048_000);
  assert.equal(pricing.providerCommissionAmountMinor, 104_800);
  assert.equal(pricing.lawyerCommissionShareMinor, 62_880);
  assert.equal(pricing.juroCommissionShareMinor, 41_920);
  assert.equal(pricing.lawyerCommissionShareMinor + pricing.juroCommissionShareMinor, pricing.providerCommissionAmountMinor);
  assert.equal(pricing.expectedProviderSettlementMinor, pricing.clientTotalMinor - pricing.providerCommissionAmountMinor);
  assert.equal(Object.isFrozen(pricing), true);
});

test("pricing fails closed for invalid reductions, custom allocation, and gross-up shortcut", () => {
  assert.throws(() => calculatePricing({ ...baseInput, subscriptionCreditMinor: 2_000_000 }), /REDUCTIONS_EXCEED/);
  assert.throws(() => calculatePricing({
    ...baseInput,
    providerFeeBearer: "CUSTOM_ALLOCATION",
    customLawyerCommissionShareMinor: 1,
    customJuroCommissionShareMinor: 1,
  }), /ALLOCATION_MISMATCH/);
  assert.throws(() => calculatePricing({ ...baseInput, providerFeeBearer: "CLIENT_GROSS_UP" }), /SEPARATE_QUOTE/);
});

test("stage-one captured subscription produces a balanced double-entry posting", () => {
  const pricing = calculatePricing({
    ...baseInput,
    lawyerBaseAmountMinor: 0,
    juroBaseAmountMinor: 1_000_000,
    providerCommissionRateBasisPoints: 0,
    providerFeeBearer: "PLATFORM_ABSORBS",
  });
  const posting = buildCapturedPaymentLedger(pricing, "SUBSCRIPTION_REVENUE");
  assert.equal(posting.debitMinor, 1_120_000);
  assert.equal(posting.creditMinor, 1_120_000);
  assert.deepEqual(posting.entries.map((entry) => entry.accountCode), [
    "BANK_CASH",
    "SUBSCRIPTION_REVENUE",
    "VAT_PAYABLE",
  ]);
  assert.throws(() => balanceLedgerEntries([
    { accountCode: "BANK_CASH", side: "DEBIT", amountMinor: 10, currency: "UZS", memo: "x" },
    { accountCode: "JURO_REVENUE", side: "CREDIT", amountMinor: 9, currency: "UZS", memo: "y" },
  ]), /UNBALANCED/);
});

