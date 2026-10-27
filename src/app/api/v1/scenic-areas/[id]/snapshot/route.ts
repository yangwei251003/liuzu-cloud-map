import { handleFormalScenicSnapshotRequest } from "@/lib/server/formal-routing-http";
import { postgresFormalRoutingRepository } from "@/lib/server/formal-routing-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleFormalScenicSnapshotRequest(request, postgresFormalRoutingRepository, id);
}
