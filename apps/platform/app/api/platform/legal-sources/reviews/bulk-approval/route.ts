import {
  handleLegalSourceBulkApprovalRequest,
} from "../../../../../../lib/legal/source-staff-http";
import {
  runtimeLegalSourceStaffDependencies,
} from "../../../../../../lib/legal/source-staff-runtime";

export const POST = async function POST(request: Request) {
  return handleLegalSourceBulkApprovalRequest(
    request,
    runtimeLegalSourceStaffDependencies(),
  );
};
