"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import {
  SlidersHorizontal,
  CheckSquareOffset,
  MapPin,
  CalendarCheck,
  MapTrifold,
  Sparkle,
  House,
  ShieldCheck,
  Storefront,
} from "@phosphor-icons/react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = usePortalAuth();

  const menuItems = [
    { label: "总览仪表盘", href: "/studio", icon: House },
    { label: "审核中心", href: "/studio/reviews", icon: CheckSquareOffset, highlightBadge: true },
    { label: "地点资源管理", href: "/studio/resources", icon: MapPin },
    { label: "体验活动管理", href: "/studio/activities", icon: CalendarCheck },
    { label: "地图点位落图", href: "/studio/map-editor", icon: MapTrifold },
    { label: "推荐位编排", href: "/studio/featured", icon: Sparkle },
  ];

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans flex flex-col md:flex-row">
      {/* Studio 左侧深色控制栏 */}
      <aside className="w-full md:w-64 bg-stone-900 text-stone-200 border-r border-stone-800 flex flex-col shrink-0">
        {/* 顶部 Brand */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between">
          <Link href="/studio" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
              <SlidersHorizontal size={20} weight="fill" />
            </div>
            <div>
              <span className="font-bold text-white text-base leading-none block">
                云游 Studio
              </span>
              <span className="text-[11px] text-stone-400 font-medium leading-tight block mt-0.5">
                文旅运营与内容治理台
              </span>
            </div>
          </Link>
        </div>

        {/* 导航菜单 */}
        <nav className="p-3 space-y-1 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-stone-300 hover:text-white hover:bg-stone-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={18} weight={isActive ? "fill" : "regular"} className={isActive ? "text-white" : "text-stone-400"} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* 底部当前操作人 */}
        <div className="p-4 border-t border-stone-800 text-xs text-stone-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center font-bold text-xs">
              审
            </div>
            <div>
              <div className="font-semibold text-stone-200">{user.name}</div>
              <div className="text-[10px] text-stone-500">平台高级运营审核员</div>
            </div>
          </div>
          <Link href="/judge" className="text-amber-400 hover:underline text-[11px]">
            切换
          </Link>
        </div>
      </aside>

      {/* 主体工作区 */}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
