import { handlePublishRouteOperationalRelease } from "@/lib/server/route-operational-release-http";
import { productionRouteOperationalReleaseDependencies } from "@/lib/server/route-operational-release-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; releaseId: string }> },
) {
  const { id, releaseId } = await context.params;
  return handlePublishRouteOperationalRelease(request, id, releaseId, productionRouteOperationalReleaseDependencies);
}
