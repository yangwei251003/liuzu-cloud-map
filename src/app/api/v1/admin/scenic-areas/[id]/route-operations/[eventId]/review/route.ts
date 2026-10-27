import { handleReviewRouteClosure } from "@/lib/server/route-operations-http";
import { productionRouteOperationsDependencies } from "@/lib/server/route-operations-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await context.params;
  return handleReviewRouteClosure(request, id, eventId, productionRouteOperationsDependencies);
}
