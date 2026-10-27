import { ArrowLeft, Gavel, MapTrifold, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { MapDraftEditor } from "@/components/MapDraftEditor";

export const metadata: Metadata = {
  title: "候选地图草稿编辑器｜六祖云游",
  description: "在与发布数据隔离的浏览器草稿区绘制六祖云游候选地图对象。",
  robots: { index: false, follow: false },
};

export default function MapEditorPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f7f1e7]">
      <header className="border-b border-[#173f35]/12 bg-[#fffdf8]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#173f35] hover:bg-[#173f35]/6" aria-label="返回运营治理台"><ArrowLeft size={18} /><span className="hidden sm:inline">运营治理台</span></Link>
          <h1 className="min-w-0 truncate text-sm font-semibold text-[#173f35]">候选地图草稿编辑器</h1>
          <div className="flex items-center gap-2"><Link href="/admin/gis-review" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-xs font-semibold text-[#173f35]" aria-label="进入 GIS 专业审核台"><Gavel size={18} /><span className="hidden lg:inline">GIS 审核</span></Link><Link href="/admin/readiness" className="hidden min-h-11 items-center gap-2 rounded-full border border-[#173f35]/14 px-4 text-xs font-semibold text-[#173f35] sm:inline-flex" aria-label="进入正式发布证据预检"><ShieldCheck size={18} /><span className="hidden xl:inline">发布预检</span></Link><Link href="/map" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#173f35] px-4 text-xs font-semibold text-white" aria-label="打开游客地图"><MapTrifold size={18} /><span className="hidden md:inline">游客地图</span></Link></div>
        </div>
      </header>
      <MapDraftEditor />
    </main>
  );
}
