import {
  handleLegalSourceWithdrawalRequest,
} from "../../../../../../../lib/legal/source-staff-http";
import {
  runtimeLegalSourceStaffDependencies,
} from "../../../../../../../lib/legal/source-staff-runtime";

export const POST = async function POST(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  const { publicationId } = await context.params;
  return handleLegalSourceWithdrawalRequest(
    request,
    publicationId,
    runtimeLegalSourceStaffDependencies(),
  );
};