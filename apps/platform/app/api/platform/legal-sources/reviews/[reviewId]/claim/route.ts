import {
  handleLegalSourceReviewClaimRequest,
} from "../../../../../../../lib/legal/source-staff-http";
import {
  runtimeLegalSourceStaffDependencies,
} from "../../../../../../../lib/legal/source-staff-runtime";

export const POST = async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await context.params;
  return handleLegalSourceReviewClaimRequest(
    request,
    reviewId,
    runtimeLegalSourceStaffDependencies(),
  );
};
