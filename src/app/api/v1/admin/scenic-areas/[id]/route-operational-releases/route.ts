import {
  handlePrepareRouteOperationalRelease,
  handleReadRouteOperationalReleases,
} from "@/lib/server/route-operational-release-http";
import { productionRouteOperationalReleaseDependencies } from "@/lib/server/route-operational-release-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReadRouteOperationalReleases(request, id, productionRouteOperationalReleaseDependencies);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlePrepareRouteOperationalRelease(request, id, productionRouteOperationalReleaseDependencies);
}
