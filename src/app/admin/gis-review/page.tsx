import { ArrowLeft, MapTrifold, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { GisDraftReviewWorkbench } from "@/components/GisDraftReviewWorkbench";

export const metadata: Metadata = {
  title: "GIS 专业审核台｜六祖云游",
  description: "审核与正式发布数据隔离的 GIS 候选版本。",
  robots: { index: false, follow: false },
};

export default function GisReviewPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f1e7]">
      <header className="border-b border-[#173f35]/12 bg-[#fffdf8]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1580px] items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#173f35] hover:bg-[#173f35]/6" aria-label="返回运营治理台"><ArrowLeft size={18} /><span className="hidden sm:inline">运营治理台</span></Link>
          <h1 className="min-w-0 truncate text-sm font-semibold text-[#173f35]">GIS 专业审核台</h1>
          <div className="flex items-center gap-2"><Link href="/admin/map-editor" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-xs font-semibold text-[#173f35]" aria-label="进入候选地图草稿编辑器"><MapTrifold size={18} /><span className="hidden md:inline">候选编辑</span></Link><Link href="/admin/gis-formalization" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#173f35] px-4 text-xs font-semibold text-white" aria-label="进入 GIS 正式化发布台"><ShieldCheck size={18} /><span className="hidden sm:inline">正式化</span></Link></div>
        </div>
      </header>
      <GisDraftReviewWorkbench />
    </main>
  );
}
