import { handleReadGisDraftSubmissionForReview } from "@/lib/server/gis-draft-submission-http";
import { productionGisDraftWorkflowDependencies } from "@/lib/server/gis-draft-submission-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await context.params;
  return handleReadGisDraftSubmissionForReview(
    request,
    id,
    submissionId,
    productionGisDraftWorkflowDependencies,
  );
}
