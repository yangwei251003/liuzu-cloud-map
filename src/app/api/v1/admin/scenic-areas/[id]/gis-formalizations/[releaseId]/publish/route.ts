import { handlePublishGisFormalization } from "@/lib/server/gis-formalization-http";
import { productionGisFormalizationDependencies } from "@/lib/server/gis-formalization-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; releaseId: string }> };

export async function POST(request: Request, context: Context) {
  const { id, releaseId } = await context.params;
  return handlePublishGisFormalization(request, id, releaseId, productionGisFormalizationDependencies);
}
