import {
  handleReadRouteOperationalObservations,
  handleSubmitRouteOperationalObservation,
} from "@/lib/server/route-operational-observation-http";
import { productionRouteOperationalObservationDependencies } from "@/lib/server/route-operational-observation-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReadRouteOperationalObservations(request, id, productionRouteOperationalObservationDependencies);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleSubmitRouteOperationalObservation(request, id, productionRouteOperationalObservationDependencies);
}
