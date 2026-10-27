import type { Metadata } from "next";
import { CloudTourExperience } from "@/components/CloudTourExperience";

export const metadata: Metadata = {
  title: "六祖云游模式｜线上文化体验",
  description: "不依赖定位的六祖文化线上云游；讲解标注事实类型、来源和审核状态，不作为现场导航或开放依据。",
};

export default function CloudTourPage() {
  return <CloudTourExperience />;
}
