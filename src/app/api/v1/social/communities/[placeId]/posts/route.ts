import { createSocialPost, listSocialCommunityPosts } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  return listSocialCommunityPosts(request, (await params).placeId);
}

export async function POST(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  return createSocialPost(request, (await params).placeId);
}
