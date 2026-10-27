import { handleReviewRouteOperationalObservation } from "@/lib/server/route-operational-observation-http";
import { productionRouteOperationalObservationDependencies } from "@/lib/server/route-operational-observation-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; observationId: string }> }) {
  const { id, observationId } = await context.params;
  return handleReviewRouteOperationalObservation(request, id, observationId, productionRouteOperationalObservationDependencies);
}
