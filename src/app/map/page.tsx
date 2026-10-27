import type { Metadata } from "next";
import { DetailedMapExperience } from "@/components/DetailedMapExperience";
import "./map-workspace.css";
import "./map-social.css";

export const metadata: Metadata = {
  title: "景区专属导览｜六祖云游",
  description: "查看新兴景点、道路、设施与旅行路线，使用高德地图规划出行。",
};

export default function DetailedMapPage() {
  return (
    <main className="liuzu-map-page">
      <h1 className="sr-only">六祖云游景区专属导览地图</h1>
      <DetailedMapExperience />
    </main>
  );
}
