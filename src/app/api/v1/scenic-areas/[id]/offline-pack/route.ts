import { handleFormalOfflinePackRequest } from "@/lib/server/formal-offline-pack-http";
import { productionFormalOfflinePackDependencies } from "@/lib/server/formal-offline-pack-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleFormalOfflinePackRequest(request, productionFormalOfflinePackDependencies, id);
}
