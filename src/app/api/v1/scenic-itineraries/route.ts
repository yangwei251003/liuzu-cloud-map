import { handleFormalScenicItineraryRequest } from "@/lib/server/formal-itinerary-http";
import { postgresFormalRoutingRepository } from "@/lib/server/formal-routing-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFormalScenicItineraryRequest(request, postgresFormalRoutingRepository);
}
