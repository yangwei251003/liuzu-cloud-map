import { ArrowLeft, Gavel, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { GisFormalizationWorkbench } from "@/components/GisFormalizationWorkbench";

export const metadata: Metadata = {
  title: "GIS 正式化发布台｜六祖云游",
  description: "将已审核 GIS 候选通过职责分离流程形成正式路网快照。",
  robots: { index: false, follow: false },
};

export default function GisFormalizationPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f1e7]">
      <header className="border-b border-[#173f35]/12 bg-[#fffdf8]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#173f35] hover:bg-[#173f35]/6"><ArrowLeft size={18} /><span className="hidden sm:inline">运营治理台</span></Link>
          <h1 className="min-w-0 truncate text-sm font-semibold text-[#173f35]">GIS 正式化发布台</h1>
          <div className="flex items-center gap-2"><Link href="/admin/gis-review" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-xs font-semibold"><Gavel size={18} /><span className="hidden md:inline">专业审核</span></Link><Link href="/admin/readiness" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#173f35] px-4 text-xs font-semibold text-white"><ShieldCheck size={18} /><span className="hidden md:inline">发布预检</span></Link></div>
        </div>
      </header>
      <GisFormalizationWorkbench />
    </main>
  );
}
