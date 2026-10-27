import type { Metadata } from "next";
import { SocialCommunityExperience } from "@/components/SocialCommunityExperience";

export const metadata: Metadata = {
  title: "地点社区｜六祖云游",
  description: "在地点社区浏览游客照片、话题、挑战、评论与旅行打卡。",
};

export default function CommunityPage() {
  return <SocialCommunityExperience />;
}
