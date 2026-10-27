"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository } from "@/lib/portal/demo-repository";
import { PortalRole } from "@/lib/portal/types";
import {
  Compass,
  Storefront,
  SlidersHorizontal,
  ArrowsCounterClockwise,
  Question,
} from "@phosphor-icons/react";

export function JudgeDemoToolbar() {
  const { switchRole } = usePortalAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleRoleChange = (newRole: PortalRole, targetPath: string) => {
    switchRole(newRole);
    router.push(targetPath);
  };

  const handleResetData = () => {
    if (confirm("确定要恢复初始预置的文旅资源、活动及审核数据吗？")) {
      PortalDemoRepository.resetToSeedData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
    }
  };

  return (
    <aside aria-label="评委演示控制条" className="fixed top-3 right-3 z-50 flex items-center gap-1.5 bg-stone-900/90 text-stone-100 backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl border border-stone-700/80 text-xs font-sans">
      <div className="flex items-center gap-1 font-semibold text-amber-400 pr-1.5 border-r border-stone-700">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>演示中枢</span>
      </div>

      <div className="flex items-center gap-1">
        {/* 游客端切换 */}
        <button
          onClick={() => handleRoleChange("visitor", "/map")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
            pathname.startsWith("/map") || pathname === "/" || pathname.startsWith("/explore") || pathname.startsWith("/place") || pathname.startsWith("/activity")
              ? "bg-emerald-700 text-white font-medium shadow-sm"
              : "hover:bg-stone-800 text-stone-300"
          }`}
          title="切换至游客端：查看地图与发布资源"
        >
          <Compass size={14} weight="bold" />
          <span>游客端</span>
        </button>

        {/* 商户端切换 */}
        <button
          onClick={() => handleRoleChange("partner", "/partner/workbench")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
            pathname.startsWith("/partner")
              ? "bg-amber-600 text-white font-medium shadow-sm"
              : "hover:bg-stone-800 text-stone-300"
          }`}
          title="切换至商户端：提交资源与查看审核进度"
        >
          <Storefront size={14} weight="bold" />
          <span>伙伴中心</span>
        </button>

        {/* Studio 审核端切换 */}
        <button
          onClick={() => handleRoleChange("studio", "/studio/reviews")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${
            pathname.startsWith("/studio")
              ? "bg-indigo-600 text-white font-medium shadow-sm"
              : "hover:bg-stone-800 text-stone-300"
          }`}
          title="切换至管理端：审核提交、落图校准与发布"
        >
          <SlidersHorizontal size={14} weight="bold" />
          <span>Studio</span>
        </button>
      </div>

      {/* 演示数据重置按钮 */}
      <div className="pl-1.5 border-l border-stone-700 flex items-center gap-1">
        <button
          onClick={handleResetData}
          className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-stone-800 text-stone-300 transition-colors"
          title="一键恢复初始预置数据"
        >
          <ArrowsCounterClockwise size={13} className={resetSuccess ? "animate-spin text-emerald-400" : ""} />
          <span>{resetSuccess ? "已重置" : "重置数据"}</span>
        </button>

        <Link
          href="/judge"
          className={`p-1 rounded-full transition-colors ${pathname === "/judge" ? "text-amber-400" : "text-stone-400 hover:text-white"}`}
          title="打开完整评委演示面板"
        >
          <Question size={15} weight="bold" />
        </Link>
      </div>
    </aside>
  );
}
