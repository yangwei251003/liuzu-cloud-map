import { handleVisitSessionEventRequest } from "@/lib/server/visit-session-http";
import { productionVisitSessionDependencies } from "@/lib/server/visit-session-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleVisitSessionEventRequest(request, productionVisitSessionDependencies, id);
}
