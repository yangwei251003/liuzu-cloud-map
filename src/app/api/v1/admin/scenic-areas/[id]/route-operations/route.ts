import {
  handleActivateRouteClosure,
  handleReadRouteOperations,
} from "@/lib/server/route-operations-http";
import { productionRouteOperationsDependencies } from "@/lib/server/route-operations-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReadRouteOperations(request, id, productionRouteOperationsDependencies);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleActivateRouteClosure(request, id, productionRouteOperationsDependencies);
}
