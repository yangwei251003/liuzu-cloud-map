import { ArrowLeft, MapTrifold, ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { RouteOperationalObservationWorkbench } from "@/components/RouteOperationalObservationWorkbench";
import { RouteOperationalReleasePanel } from "@/components/RouteOperationalReleasePanel";
import { RouteOperationsWorkbench } from "@/components/RouteOperationsWorkbench";

export const metadata: Metadata = {
  title: "道路运营管制台｜六祖云游",
  description: "对已发布、现场核验的正式路网执行紧急封闭、客流天气观测、独立复核与完整快照发布。",
  robots: { index: false, follow: false },
};

export default function RouteOperationsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f1e7]">
      <header className="border-b border-[#173f35]/12 bg-[#fffdf8]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#173f35] hover:bg-[#173f35]/6" aria-label="返回运营治理台"><ArrowLeft size={18} /><span className="hidden sm:inline">运营治理台</span></Link>
          <h1 className="min-w-0 truncate text-sm font-semibold text-[#173f35]">道路运营管制台</h1>
          <div className="flex items-center gap-2"><Link href="/admin/gis-review" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-xs font-semibold text-[#173f35]"><MapTrifold size={18} /><span className="hidden md:inline">GIS 审核</span></Link><span className="hidden min-h-11 items-center gap-2 rounded-full bg-[#a85749] px-4 text-xs font-semibold text-white sm:inline-flex"><ShieldWarning size={18} />安全控制</span></div>
        </div>
      </header>
      <RouteOperationsWorkbench />
      <RouteOperationalObservationWorkbench />
      <RouteOperationalReleasePanel />
    </main>
  );
}
