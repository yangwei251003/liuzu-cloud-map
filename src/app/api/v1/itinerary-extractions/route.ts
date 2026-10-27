import { handleStructuredItineraryExtractionRequest } from "@/lib/server/p0-itinerary-extraction-http";
import { unavailablePublishedPoiCatalogRepository } from "@/lib/server/p0-itinerary-extraction-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The wired adapter deliberately fails closed until a reviewed published POI
 * catalog repository is configured. The handler itself is separately tested
 * with an injected catalog and never consults candidate scenic data.
 */
export async function POST(request: Request) {
  return handleStructuredItineraryExtractionRequest(request, unavailablePublishedPoiCatalogRepository);
}
