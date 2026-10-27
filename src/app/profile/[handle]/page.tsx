import type { Metadata } from "next";
import { TravelProfileExperience } from "@/components/TravelProfileExperience";

export const metadata: Metadata = {
  title: "旅行档案｜六祖云游",
  description: "查看旅行足迹、打卡、照片与地点动态。",
};

export default async function TravelProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <TravelProfileExperience handle={handle} />;
}
