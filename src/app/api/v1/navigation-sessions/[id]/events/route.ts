import { handleNavigationSessionEvent } from "@/lib/server/navigation-session-http";
import { productionNavigationSessionDependencies } from "@/lib/server/navigation-session-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleNavigationSessionEvent(request, productionNavigationSessionDependencies, (await context.params).id);
}
