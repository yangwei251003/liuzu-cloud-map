import { mutateGroupLocationShare } from "@/lib/server/group-location-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return mutateGroupLocationShare(request, (await context.params).id);
}
