import { getSocialProfile } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return getSocialProfile((await params).handle);
}
