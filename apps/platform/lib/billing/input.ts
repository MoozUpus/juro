import { z } from "zod";

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
