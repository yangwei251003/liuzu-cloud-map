import type { Metadata } from "next";
import { SharedRouteViewer } from "@/components/SharedRouteViewer";

export const metadata: Metadata = {
  title: "只读路线分享｜六祖云游",
  description: "查看一条 7 天有效的六祖云游只读旅行路线。",
};

export default function ShareRoutePage() {
  return <SharedRouteViewer />;
}
