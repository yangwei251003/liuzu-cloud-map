import type { Metadata } from "next";
import { FormalPlaceCommunityExperience } from "@/components/FormalPlaceCommunityExperience";
import { SocialCommunityExperience } from "@/components/SocialCommunityExperience";
import { SOCIAL_COMMUNITIES } from "@/lib/social/catalog";

export const metadata: Metadata = {
  title: "地点社区｜六祖云游",
  description: "查看与地点分层绑定的审核旅行动态和打卡内容。",
};

export function generateStaticParams() {
  return SOCIAL_COMMUNITIES.map(({ placeId }) => ({ placeId }));
}

export default async function PlaceCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string }>;
  searchParams: Promise<{ source?: string | string[]; scenicAreaId?: string | string[] }>;
}) {
  const { placeId } = await params;
  const query = await searchParams;
  const scenicAreaId = typeof query.scenicAreaId === "string" && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(query.scenicAreaId) ? query.scenicAreaId : null;
  if (query.source === "formal" && scenicAreaId && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(placeId)) {
    return <FormalPlaceCommunityExperience placeId={placeId} scenicAreaId={scenicAreaId} />;
  }
  return <SocialCommunityExperience initialPlaceId={placeId} />;
}
