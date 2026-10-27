import { createTravelGroupInvite } from "@/lib/server/group-location-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return createTravelGroupInvite(request, (await context.params).id);
}
