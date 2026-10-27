import {
  handleCreateGisDraftSubmission,
  handleListPendingGisDraftSubmissions,
} from "@/lib/server/gis-draft-submission-http";
import { productionGisDraftWorkflowDependencies } from "@/lib/server/gis-draft-submission-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleListPendingGisDraftSubmissions(request, id, productionGisDraftWorkflowDependencies);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCreateGisDraftSubmission(request, id, productionGisDraftWorkflowDependencies);
}
