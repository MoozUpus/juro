import { readProductKpiDashboard } from "../../../../../lib/analytics/product-kpis";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

async function getProductKpis(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  return Response.json(await readProductKpiDashboard({ db: requireD1() }), {
    headers: privateHeaders,
  });
}

export const GET = withPlatformStaffErrors(getProductKpis);
