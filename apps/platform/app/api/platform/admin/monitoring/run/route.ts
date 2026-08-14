import { assertSafeWrite } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import { runLexMetadataMonitor } from "../../../../../../lib/legal/metadata-monitor";
import {
  requirePlatformStaffRequest,
  withPlatformStaffErrors,
} from "../../../../../../lib/auth/staff-http";

export const POST = withPlatformStaffErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  await requirePlatformStaffRequest(request, "staff.operations.manage", {
    freshMfaWithinMs: 5 * 60 * 1_000,
  });
  const env = runtimeEnv();
  const result = await runLexMetadataMonitor({
    ...env,
    APP_ENV: env.APP_ENV ?? "development",
    DB: requireD1(),
  }, {
    runType: "manual_metadata_monitor",
    // A protected operator action is deliberately limited to one RSS feed and
    // honours the same source pacing as the daily scheduler.
    maxDocuments: 20,
    wait: (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
  });
  return Response.json(result, {
    status: result.status === "success" ? 200 : result.status === "busy" ? 409 : 503,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
});
