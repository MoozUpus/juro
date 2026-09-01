import { z } from "zod";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  PRODUCT_METRICS_WINDOWS,
  readProductMetricsDashboard,
} from "../../../../../lib/platform/product-metrics";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };
const daysSchema = z.coerce.number().int().refine((value) => (
  PRODUCT_METRICS_WINDOWS.includes(value as (typeof PRODUCT_METRICS_WINDOWS)[number])
));

function environment(): "development" | "staging" | "production" {
  const value = runtimeEnv().APP_ENV;
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new Error("APP_ENV_INVALID");
}

async function getProductMetrics(request: Request): Promise<Response> {
  await requirePlatformStaffRequest(request, "staff.operations.manage", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsedDays = daysSchema.safeParse(new URL(request.url).searchParams.get("days") ?? 30);
  if (!parsedDays.success) {
    return Response.json({ code: "PRODUCT_METRICS_WINDOW_INVALID" }, {
      status: 400,
      headers: privateHeaders,
    });
  }
  return Response.json(await readProductMetricsDashboard({
    db: requireD1(),
    environment: environment(),
    days: parsedDays.data,
  }), { headers: privateHeaders });
}

export const GET = withPlatformStaffErrors(getProductMetrics);
