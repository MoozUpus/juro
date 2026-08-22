export type DemoServiceKind = "subscription" | "consultation" | "case_transfer";
export type DemoPaymentMethod = "direct" | "installment";

export type DemoFeeBreakdown = {
  serviceKind: DemoServiceKind;
  paymentMethod: DemoPaymentMethod;
  lawyerServiceAmountMinor: number;
  consultationFeeBasisPoints: number;
  consultationFeeAmountMinor: number;
  caseTransferFeeBasisPoints: number;
  caseTransferFeeAmountMinor: number;
  juroServiceMarkupBasisPoints: number;
  juroServiceMarkupMinor: number;
  clientTotalMinor: number;
  lawyerPayoutMinor: number;
  platformRevenueMinor: number;
  installmentCount: 3 | 6 | 12 | null;
  feePolicy: { id: string; version: number };
  appliedCaseTransferRule: { id: string; version: number; labelRu: string; labelUz: string } | null;
};

type Policy = {
  id: string;
  version: number;
  consultationFeeBasisPoints: number;
  installmentServiceMarkupBasisPoints: number;
  installmentWaivesCaseTransfer: number;
};

type Rule = {
  id: string;
  version: number;
  labelRu: string;
  labelUz: string;
  feeBasisPoints: 200 | 500;
};

function fee(amountMinor: number, basisPoints: number) {
  return Math.round(amountMinor * basisPoints / 10_000);
}

export async function calculateDemoFeeBreakdown(
  db: D1Database,
  input: {
    serviceKind: DemoServiceKind;
    paymentMethod: DemoPaymentMethod;
    amountMinor: number;
    legalArea?: string;
    caseType?: string;
    installmentCount?: 3 | 6 | 12;
    now?: Date;
  },
): Promise<DemoFeeBreakdown> {
  const at = (input.now ?? new Date()).toISOString();
  const policy = await db.prepare(
    `SELECT id,version,consultation_fee_basis_points AS consultationFeeBasisPoints,
      installment_service_markup_basis_points AS installmentServiceMarkupBasisPoints,
      installment_waives_case_transfer AS installmentWaivesCaseTransfer
     FROM billing_fee_policy_versions
     WHERE mode='sandbox' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)
     ORDER BY version DESC LIMIT 1`,
  ).bind(at, at).first<Policy>();
  if (!policy) throw new Error("DEMO_FEE_POLICY_UNAVAILABLE");

  let rule: Rule | null = null;
  if (input.serviceKind === "case_transfer" && input.paymentMethod === "direct") {
    rule = await db.prepare(
      `SELECT id,version,label_ru AS labelRu,label_uz AS labelUz,fee_basis_points AS feeBasisPoints
       FROM billing_case_transfer_fee_rules
       WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>?)
         AND (legal_area IS NULL OR lower(legal_area)=lower(?))
         AND (case_type IS NULL OR lower(case_type)=lower(?))
       ORDER BY priority DESC,version DESC LIMIT 1`,
    ).bind(at, at, input.legalArea ?? "", input.caseType ?? "").first<Rule>();
    if (!rule) throw new Error("CASE_TRANSFER_FEE_RULE_REQUIRED");
  }

  const consultationFeeBasisPoints = input.serviceKind === "consultation"
    ? policy.consultationFeeBasisPoints
    : 0;
  const caseTransferFeeBasisPoints = rule?.feeBasisPoints ?? 0;
  const juroServiceMarkupBasisPoints = input.paymentMethod === "installment"
    ? policy.installmentServiceMarkupBasisPoints
    : 0;
  if (input.paymentMethod === "installment" && !policy.installmentWaivesCaseTransfer) {
    throw new Error("INSTALLMENT_DOUBLE_FEE_POLICY_FORBIDDEN");
  }
  const consultationFeeAmountMinor = fee(input.amountMinor, consultationFeeBasisPoints);
  const caseTransferFeeAmountMinor = input.paymentMethod === "installment"
    ? 0
    : fee(input.amountMinor, caseTransferFeeBasisPoints);
  const juroServiceMarkupMinor = fee(input.amountMinor, juroServiceMarkupBasisPoints);
  const clientTotalMinor = input.amountMinor + juroServiceMarkupMinor;
  const lawyerPayoutMinor = input.serviceKind === "subscription"
    ? 0
    : input.amountMinor - consultationFeeAmountMinor - caseTransferFeeAmountMinor;
  return {
    serviceKind: input.serviceKind,
    paymentMethod: input.paymentMethod,
    lawyerServiceAmountMinor: input.amountMinor,
    consultationFeeBasisPoints,
    consultationFeeAmountMinor,
    caseTransferFeeBasisPoints,
    caseTransferFeeAmountMinor,
    juroServiceMarkupBasisPoints,
    juroServiceMarkupMinor,
    clientTotalMinor,
    lawyerPayoutMinor,
    platformRevenueMinor: consultationFeeAmountMinor + caseTransferFeeAmountMinor + juroServiceMarkupMinor,
    installmentCount: input.paymentMethod === "installment" ? (input.installmentCount ?? 3) : null,
    feePolicy: { id: policy.id, version: policy.version },
    appliedCaseTransferRule: rule ? { id: rule.id, version: rule.version, labelRu: rule.labelRu, labelUz: rule.labelUz } : null,
  };
}
