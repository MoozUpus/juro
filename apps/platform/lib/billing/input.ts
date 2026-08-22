import { z } from "zod";

import { DEMO_PAYMENT_ACTIONS, DEMO_PAYMENT_FLOW_TYPES } from "./demo-payments";

export const checkoutOrderParamsSchema = z.object({ orderId: z.uuid() }).strict();
export const checkoutWorkspaceQuerySchema = z.object({
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
}).strict();

export const billingPlanSelectionSchema = z.object({
  planCode: z.enum(["individual", "business", "legal_team"]),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const checkoutCreateSchema = z.object({
  requestId: z.uuid(),
  planVersionId: z.uuid(),
  locale: z.enum(["ru", "uz"]),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
}).strict();

export const checkoutConfirmSchema = z.object({
  requestId: z.uuid(),
  locale: z.enum(["ru", "uz"]),
  accountType: z.enum(["individual", "entrepreneur", "lawyer", "business"]),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
  renewalMode: z.enum(["ONE_TIME", "AUTO_RENEW"]),
  paymentMethod: z.enum(["SANDBOX_CARD"]),
}).strict();

export const sandboxAuthorizeSchema = z.object({
  requestId: z.uuid(),
  locale: z.enum(["ru", "uz"]),
  outcome: z.enum(["FUNDED", "DECLINED"]),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
}).strict();

export const sandboxPaymentEventSchema = z.object({
  eventId: z.uuid(),
  type: z.enum(["payment.funded", "payment.failed"]),
  providerAttemptId: z.string().min(8).max(160),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("UZS"),
  occurredAt: z.iso.datetime({ offset: true }),
}).strict();

export const subscriptionEntitlementsConfigSchema = z.object({
  entitlements: z.array(z.object({
    code: z.string().regex(/^[a-z][a-z0-9_.-]{1,63}$/),
    limitValue: z.number().int().nonnegative().nullable(),
    unit: z.string().regex(/^[a-z][a-z0-9_.-]{1,31}$/),
    rolloverAllowed: z.boolean().default(false),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  }).strict()).max(64).default([]),
}).strict();

const demoBaseSchema = z.object({
  requestId: z.uuid(),
  locale: z.enum(["ru", "uz"]),
  workspaceId: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/).optional(),
});

export const demoPaymentInputSchema = z.discriminatedUnion("action", [
  demoBaseSchema.extend({
    action: z.literal("create"),
    flowType: z.enum(DEMO_PAYMENT_FLOW_TYPES),
    amountMinor: z.number().int().positive().max(100_000_000_000),
    installmentCount: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional(),
    serviceKind: z.enum(["subscription", "consultation", "case_transfer"]).optional(),
    legalArea: z.string().trim().min(2).max(120).optional(),
    caseType: z.string().trim().min(2).max(120).optional(),
  }).strict(),
  demoBaseSchema.extend({
    action: z.literal("transition"),
    runId: z.uuid(),
    outcome: z.enum(DEMO_PAYMENT_ACTIONS),
  }).strict(),
]).superRefine((value, context) => {
  if (value.action !== "create") return;
  if (value.flowType === "subscription" && value.serviceKind && value.serviceKind !== "subscription") {
    context.addIssue({ code: "custom", message: "SUBSCRIPTION_SERVICE_KIND_INVALID", path: ["serviceKind"] });
  }
  if (value.flowType === "lawyer_service") {
    if (value.serviceKind === "subscription") {
      context.addIssue({ code: "custom", message: "LAWYER_SERVICE_KIND_INVALID", path: ["serviceKind"] });
    }
    if (value.serviceKind === "case_transfer" && !value.legalArea && !value.caseType) {
      context.addIssue({ code: "custom", message: "CASE_TRANSFER_MATCH_REQUIRED", path: ["legalArea"] });
    }
  }
  if (value.flowType !== "uzum_installment" && value.installmentCount !== undefined) {
    context.addIssue({ code: "custom", message: "INSTALLMENT_COUNT_INVALID", path: ["installmentCount"] });
  }
});
