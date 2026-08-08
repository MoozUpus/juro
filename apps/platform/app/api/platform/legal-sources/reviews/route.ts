import {
  handleLegalSourceReviewListRequest,
} from "../../../../../lib/legal/source-staff-http";
import {
  runtimeLegalSourceStaffDependencies,
} from "../../../../../lib/legal/source-staff-runtime";

export const GET = async function GET(request: Request) {
  return handleLegalSourceReviewListRequest(
    request,
    runtimeLegalSourceStaffDependencies(),
  );
};
