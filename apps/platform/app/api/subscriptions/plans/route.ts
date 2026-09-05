import { paymentFoundationStatus } from "../../../../lib/billing/foundation";
import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  await workspaceForUser(user);
  const availability = paymentFoundationStatus(runtimeEnv());
  if (!availability.enabled) return Response.json({ code: "BILLING_UNAVAILABLE", reason: availability.reason }, { status: 503 });
  const now = new Date().toISOString();
  const plans = await requireD1().prepare(`SELECT v.id AS planVersionId,p.code,v.name_ru AS nameRu,v.name_uz AS nameUz,v.name_en AS nameEn,
    v.billing_period AS billingPeriod,v.price_minor AS priceMinor,v.currency,v.entitlements_json AS entitlementsJson,
    v.effective_from AS effectiveFrom,v.effective_to AS effectiveTo
    FROM subscription_plan_versions v JOIN subscription_plans p ON p.id=v.plan_id
    WHERE p.status='active' AND v.approval_status='approved' AND v.effective_from<=?
      AND (v.effective_to IS NULL OR v.effective_to>?) ORDER BY v.price_minor,p.code`).bind(now, now).all();
  return Response.json({ plans: plans.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
});
