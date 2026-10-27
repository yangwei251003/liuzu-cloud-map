import type { Metadata } from "next";
import { JourneyCenter } from "@/components/JourneyCenter";

export const metadata: Metadata = {
  title: "我的旅程｜六祖云游",
  description: "在当前设备保存个人路线、到访印章与游记草稿。",
};

export default function JourneyPage() {
  return <JourneyCenter />;
}
