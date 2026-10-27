import { mutateSocialReaction } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutateSocialReaction(request, (await params).id);
}
