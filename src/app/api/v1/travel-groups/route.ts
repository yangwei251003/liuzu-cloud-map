import { createTemporaryTravelGroup } from "@/lib/server/group-location-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return createTemporaryTravelGroup(request);
}
