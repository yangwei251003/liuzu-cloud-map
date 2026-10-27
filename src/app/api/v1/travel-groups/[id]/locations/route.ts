import { listGroupLocations } from "@/lib/server/group-location-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return listGroupLocations(request, (await context.params).id);
}
