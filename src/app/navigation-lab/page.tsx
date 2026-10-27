import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NavigationSimulationLab } from "@/components/NavigationSimulationLab";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "虚构内部导航实验室｜六祖云游",
  description: "使用完全虚构的测试路网验证确定性导航、偏航暂停与封路重算，不用于实地导航。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function NavigationLabPage() {
  const enabled = process.env.NODE_ENV !== "production"
    || process.env.FICTIONAL_NAVIGATION_LAB_ENABLED === "1"
    || process.env.NEXT_PUBLIC_FICTIONAL_NAVIGATION_LAB_ENABLED === "1";
  if (!enabled) notFound();
  return (
    <PageShell title="虚构导航实验室" contentClassName="min-h-[100dvh]">
      <NavigationSimulationLab />
    </PageShell>
  );
}
