import { updateGroupLocation } from "@/lib/server/group-location-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateGroupLocation(request, (await context.params).id);
}
