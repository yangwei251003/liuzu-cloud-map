import { createTravelCheckIn } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return createTravelCheckIn(request);
}
