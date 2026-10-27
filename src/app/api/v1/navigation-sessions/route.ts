import { handleCreateNavigationSession, handleNavigationSessionHistory } from "@/lib/server/navigation-session-http";
import { productionNavigationSessionDependencies } from "@/lib/server/navigation-session-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleNavigationSessionHistory(request, productionNavigationSessionDependencies);
}

export async function POST(request: Request) {
  return handleCreateNavigationSession(request, productionNavigationSessionDependencies);
}
