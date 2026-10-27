import {
  handleCreateItineraryRequest,
  handleListItinerariesRequest,
} from "@/lib/server/itinerary-revision-http";
import { productionItineraryRevisionDependencies } from "@/lib/server/itinerary-revision-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListItinerariesRequest(request, productionItineraryRevisionDependencies);
}

export async function POST(request: Request) {
  return handleCreateItineraryRequest(request, productionItineraryRevisionDependencies);
}
