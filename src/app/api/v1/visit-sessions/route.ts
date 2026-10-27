import { handleCreateVisitSessionRequest } from "@/lib/server/visit-session-http";
import { productionVisitSessionDependencies } from "@/lib/server/visit-session-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateVisitSessionRequest(request, productionVisitSessionDependencies);
}
