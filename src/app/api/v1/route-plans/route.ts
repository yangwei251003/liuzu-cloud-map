import { handleFormalRoutePlanRequest } from "@/lib/server/formal-routing-http";
import { postgresFormalRoutingRepository } from "@/lib/server/formal-routing-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFormalRoutePlanRequest(request, postgresFormalRoutingRepository);
}
