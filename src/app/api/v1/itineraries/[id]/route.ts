import {
  handleDeleteItineraryRequest,
  handleEditItineraryRequest,
  handleReadItineraryRequest,
} from "@/lib/server/itinerary-revision-http";
import { productionItineraryRevisionDependencies } from "@/lib/server/itinerary-revision-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReadItineraryRequest(request, productionItineraryRevisionDependencies, id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleEditItineraryRequest(request, productionItineraryRevisionDependencies, id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleDeleteItineraryRequest(request, productionItineraryRevisionDependencies, id);
}
