import { nonNegativeMinor } from "./money";
import type { PricingCalculation } from "./pricing";

export const LEDGER_ACCOUNT_CODES = [
  "UZUM_SETTLEMENT_RECEIVABLE",
  "BANK_CASH",
  "LAWYER_PAYABLE",
  "JURO_REVENUE",
  "SUBSCRIPTION_REVENUE",
  "UZUM_COMMISSION_EXPENSE",
  "VAT_PAYABLE",
  "REFUND_LIABILITY",
  "DISPUTE_RESERVE",
  "PAYOUT_IN_TRANSIT",
  "GUARANTEE_LIABILITY",
  "GUARANTEE_RECOVERY_RECEIVABLE",
] as const;

export type LedgerAccountCode = typeof LEDGER_ACCOUNT_CODES[number];
export type LedgerSide = "DEBIT" | "CREDIT";
export type LedgerEntryDraft = Readonly<{
  accountCode: LedgerAccountCode;
  side: LedgerSide;
  amountMinor: number;
  currency: "UZS";
  memo: string;
}>;

export type BalancedLedgerDraft = Readonly<{
  entries: readonly LedgerEntryDraft[];
  debitMinor: number;
  creditMinor: number;
  currency: "UZS";
}>;

export function balanceLedgerEntries(entries: readonly LedgerEntryDraft[]): BalancedLedgerDraft {
  if (entries.length < 2) throw new RangeError("LEDGER_REQUIRES_AT_LEAST_TWO_ENTRIES");
  let debit = 0n;
  let credit = 0n;
  for (const entry of entries) {
    const amount = nonNegativeMinor(entry.amountMinor, "ledger_entry_amount");
    if (amount === 0) throw new RangeError("ZERO_LEDGER_ENTRY_FORBIDDEN");
    if (entry.currency !== "UZS") throw new RangeError("LEDGER_CURRENCY_MISMATCH");
    if (entry.side === "DEBIT") debit += BigInt(amount);
    else credit += BigInt(amount);
  }
  if (debit !== credit) throw new RangeError("UNBALANCED_LEDGER_TRANSACTION");
  const debitMinor = Number(debit);
  const creditMinor = Number(credit);
  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
    throw new RangeError("LEDGER_TOTAL_OVERFLOW");
  }
  return Object.freeze({ entries: Object.freeze([...entries]), debitMinor, creditMinor, currency: "UZS" });
}

/** Stage-1 capture posting. Provider-fee allocation is added in the marketplace/BNPL stage. */
export function buildCapturedPaymentLedger(
  pricing: PricingCalculation,
  revenueAccount: "JURO_REVENUE" | "SUBSCRIPTION_REVENUE",
): BalancedLedgerDraft {
  if (pricing.providerCommissionAmountMinor !== 0) {
    throw new RangeError("PROVIDER_COMMISSION_POSTING_REQUIRES_SETTLEMENT_ALLOCATION");
  }
  if (pricing.subscriptionCreditMinor !== 0 || pricing.discountAmountMinor !== 0) {
    throw new RangeError("REDUCTION_POSTING_REQUIRES_EXPLICIT_FUNDING_SOURCE");
  }

  const entries: LedgerEntryDraft[] = [{
    accountCode: "BANK_CASH",
    side: "DEBIT",
    amountMinor: pricing.clientTotalMinor,
    currency: "UZS",
    memo: "Captured customer payment",
  }];
  if (pricing.lawyerGrossAmountMinor > 0) entries.push({
    accountCode: "LAWYER_PAYABLE",
    side: "CREDIT",
    amountMinor: pricing.lawyerGrossAmountMinor,
    currency: "UZS",
    memo: "Amount payable to legal-service provider",
  });
  if (pricing.juroBaseAmountMinor > 0) entries.push({
    accountCode: revenueAccount,
    side: "CREDIT",
    amountMinor: pricing.juroBaseAmountMinor,
    currency: "UZS",
    memo: revenueAccount === "SUBSCRIPTION_REVENUE" ? "JURO subscription revenue" : "JURO platform revenue",
  });
  const totalVat = pricing.lawyerVatAmountMinor + pricing.juroVatAmountMinor;
  if (totalVat > 0) entries.push({
    accountCode: "VAT_PAYABLE",
    side: "CREDIT",
    amountMinor: totalVat,
    currency: "UZS",
    memo: "Component-level VAT payable",
  });
  return balanceLedgerEntries(entries);
}

