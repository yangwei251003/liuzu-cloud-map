"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import {
  Storefront,
  PlusCircle,
  ClockCounterClockwise,
  ChartLineUp,
  House,
  ShieldCheck,
} from "@phosphor-icons/react";

export default function PartnerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = usePortalAuth();

  const navItems = [
    { label: "伙伴首页", href: "/partner", icon: House },
    { label: "商户工作台", href: "/partner/workbench", icon: Storefront },
    { label: "发布新活动", href: "/partner/activities/new", icon: PlusCircle },
    { label: "审核进度", href: "/partner/submissions", icon: ClockCounterClockwise },
    { label: "表现看盘", href: "/partner/insights", icon: ChartLineUp },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col">
      {/* 伙伴中心顶部导航栏 */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/partner" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-sm font-bold">
                <Storefront size={20} weight="fill" />
              </div>
              <div>
                <span className="font-bold text-stone-900 text-base leading-none block">
                  云游伙伴中心
                </span>
                <span className="text-xs text-amber-700 font-medium leading-tight block mt-0.5">
                  县域文旅资源入驻平台
                </span>
              </div>
            </Link>
          </div>

          {/* 导航链接 */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-amber-50 text-amber-900 font-semibold shadow-xs"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                >
                  <Icon size={17} weight={isActive ? "fill" : "regular"} className={isActive ? "text-amber-700" : "text-stone-500"} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* 当前组织/用户状态 */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-stone-800">
                {user.name}
              </span>
              <span className="text-[11px] text-emerald-700 flex items-center justify-end gap-1 font-medium">
                <ShieldCheck size={13} weight="fill" /> 已认证商户
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center font-bold text-xs">
              商
            </div>
          </div>
        </div>
      </header>

      {/* 移动端快捷底部导航 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 flex items-center justify-around py-2 px-2 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 text-[11px] font-medium px-2 py-1 rounded-md ${
                isActive ? "text-amber-700 font-bold" : "text-stone-500"
              }`}
            >
              <Icon size={20} weight={isActive ? "fill" : "regular"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* 主体内容 */}
      <main className="flex-1 pb-16 md:pb-8">
        {children}
      </main>
    </div>
  );
}
