import {
  allocateProRata,
  applyBasisPoints,
  basisPoints,
  nonNegativeMinor,
} from "./money";

export const UZUM_FEE_BEARERS = [
  "PLATFORM_ABSORBS",
  "LAWYER_ABSORBS",
  "PLATFORM_AND_LAWYER_PRO_RATA",
  "CLIENT_GROSS_UP",
  "CUSTOM_ALLOCATION",
] as const;

export type UzumFeeBearer = typeof UZUM_FEE_BEARERS[number];

export type PricingCalculationInput = Readonly<{
  currency: "UZS";
  lawyerBaseAmountMinor: number;
  lawyerVatRateBasisPoints: number;
  juroBaseAmountMinor: number;
  juroVatRateBasisPoints: number;
  subscriptionCreditMinor: number;
  discountAmountMinor: number;
  providerCommissionRateBasisPoints: number;
  providerCommissionBaseMinor?: number;
  providerFeeBearer: UzumFeeBearer;
  customLawyerCommissionShareMinor?: number;
  customJuroCommissionShareMinor?: number;
  taxPolicyVersionId: string;
  pricingPolicyVersionId: string;
  calculatedAt: string;
}>;

export type PricingCalculation = Readonly<{
  currency: "UZS";
  lawyerBaseAmountMinor: number;
  lawyerVatAmountMinor: number;
  lawyerGrossAmountMinor: number;
  juroBaseAmountMinor: number;
  juroVatAmountMinor: number;
  juroGrossAmountMinor: number;
  subscriptionCreditMinor: number;
  discountAmountMinor: number;
  providerCommissionRateBasisPoints: number;
  providerCommissionBaseMinor: number;
  providerCommissionAmountMinor: number;
  lawyerCommissionShareMinor: number;
  juroCommissionShareMinor: number;
  clientTotalMinor: number;
  expectedProviderSettlementMinor: number;
  lawyerExpectedPayoutMinor: number;
  juroExpectedRevenueMinor: number;
  taxPolicyVersionId: string;
  pricingPolicyVersionId: string;
  calculatedAt: string;
}>;

function sumSafe(values: number[], label: string): number {
  const value = values.reduce((total, current) => total + BigInt(current), 0n);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label}_OVERFLOW`);
  return result;
}

export function calculatePricing(input: PricingCalculationInput): PricingCalculation {
  const lawyerBase = nonNegativeMinor(input.lawyerBaseAmountMinor, "lawyer_base_amount");
  const juroBase = nonNegativeMinor(input.juroBaseAmountMinor, "juro_base_amount");
  const lawyerVatRate = basisPoints(input.lawyerVatRateBasisPoints, "lawyer_vat_rate");
  const juroVatRate = basisPoints(input.juroVatRateBasisPoints, "juro_vat_rate");
  const subscriptionCredit = nonNegativeMinor(input.subscriptionCreditMinor, "subscription_credit");
  const discount = nonNegativeMinor(input.discountAmountMinor, "discount_amount");
  const commissionRate = basisPoints(input.providerCommissionRateBasisPoints, "provider_commission_rate");

  const lawyerVat = applyBasisPoints(lawyerBase, lawyerVatRate);
  const juroVat = applyBasisPoints(juroBase, juroVatRate);
  const lawyerGross = sumSafe([lawyerBase, lawyerVat], "LAWYER_GROSS");
  const juroGross = sumSafe([juroBase, juroVat], "JURO_GROSS");
  const grossTotal = sumSafe([lawyerGross, juroGross], "GROSS_TOTAL");
  const reductions = sumSafe([subscriptionCredit, discount], "REDUCTIONS");
  if (reductions > grossTotal) throw new RangeError("REDUCTIONS_EXCEED_GROSS_TOTAL");
  const clientTotal = grossTotal - reductions;

  const commissionBase = nonNegativeMinor(
    input.providerCommissionBaseMinor ?? clientTotal,
    "provider_commission_base",
  );
  if (commissionBase > clientTotal) throw new RangeError("COMMISSION_BASE_EXCEEDS_CLIENT_TOTAL");
  const commission = applyBasisPoints(commissionBase, commissionRate);

  let lawyerCommissionShare = 0;
  let juroCommissionShare = 0;
  if (input.providerFeeBearer === "PLATFORM_ABSORBS") {
    juroCommissionShare = commission;
  } else if (input.providerFeeBearer === "LAWYER_ABSORBS") {
    lawyerCommissionShare = commission;
  } else if (input.providerFeeBearer === "PLATFORM_AND_LAWYER_PRO_RATA") {
    const allocated = allocateProRata(commission, lawyerBase, juroBase);
    lawyerCommissionShare = allocated.lawyerMinor;
    juroCommissionShare = allocated.platformMinor;
  } else if (input.providerFeeBearer === "CUSTOM_ALLOCATION") {
    lawyerCommissionShare = nonNegativeMinor(input.customLawyerCommissionShareMinor ?? -1, "custom_lawyer_commission_share");
    juroCommissionShare = nonNegativeMinor(input.customJuroCommissionShareMinor ?? -1, "custom_juro_commission_share");
    if (sumSafe([lawyerCommissionShare, juroCommissionShare], "CUSTOM_COMMISSION") !== commission) {
      throw new RangeError("CUSTOM_COMMISSION_ALLOCATION_MISMATCH");
    }
  } else {
    throw new RangeError("CLIENT_GROSS_UP_REQUIRES_SEPARATE_QUOTE");
  }

  if (lawyerCommissionShare > lawyerGross) throw new RangeError("LAWYER_COMMISSION_EXCEEDS_GROSS");
  if (juroCommissionShare > juroBase) throw new RangeError("JURO_COMMISSION_EXCEEDS_REVENUE");
  if (commission > clientTotal) throw new RangeError("COMMISSION_EXCEEDS_CLIENT_TOTAL");

  return Object.freeze({
    currency: input.currency,
    lawyerBaseAmountMinor: lawyerBase,
    lawyerVatAmountMinor: lawyerVat,
    lawyerGrossAmountMinor: lawyerGross,
    juroBaseAmountMinor: juroBase,
    juroVatAmountMinor: juroVat,
    juroGrossAmountMinor: juroGross,
    subscriptionCreditMinor: subscriptionCredit,
    discountAmountMinor: discount,
    providerCommissionRateBasisPoints: commissionRate,
    providerCommissionBaseMinor: commissionBase,
    providerCommissionAmountMinor: commission,
    lawyerCommissionShareMinor: lawyerCommissionShare,
    juroCommissionShareMinor: juroCommissionShare,
    clientTotalMinor: clientTotal,
    expectedProviderSettlementMinor: clientTotal - commission,
    lawyerExpectedPayoutMinor: lawyerGross - lawyerCommissionShare,
    juroExpectedRevenueMinor: juroBase - juroCommissionShare,
    taxPolicyVersionId: input.taxPolicyVersionId,
    pricingPolicyVersionId: input.pricingPolicyVersionId,
    calculatedAt: input.calculatedAt,
  });
}

