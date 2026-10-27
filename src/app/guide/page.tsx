import { Suspense } from "react";
import { InterfaceState, PageShell } from "@/components/PageShell";
import { LiveGuide } from "@/components/LiveGuide";
import { FormalNavigationPlanner } from "@/components/FormalNavigationPlanner";

export const metadata = { title: "前台导览｜六祖云游" };

export default function GuidePage() {
  return (
    <PageShell title="前台导览">
      <FormalNavigationPlanner scenicAreaId="liuzu-town" />
      <Suspense fallback={<InterfaceState kind="loading" title="正在准备导览" compact className="mx-auto my-8 max-w-6xl" />}>
        <LiveGuide />
      </Suspense>
    </PageShell>
  );
}
