import { handleReviewGisDraftSubmission } from "@/lib/server/gis-draft-submission-http";
import { productionGisDraftWorkflowDependencies } from "@/lib/server/gis-draft-submission-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await context.params;
  return handleReviewGisDraftSubmission(request, id, submissionId, productionGisDraftWorkflowDependencies);
}
