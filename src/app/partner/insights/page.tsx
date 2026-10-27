"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import {
  ChartLineUp,
  Eye,
  BookmarkSimple,
  NavigationArrow,
  Storefront,
  ArrowRight,
} from "@phosphor-icons/react";

export default function PartnerInsightsPage() {
  const { user } = usePortalAuth();
  const orgId = user.organizationId || "org-liuzu-tea";
  const version = usePortalVersion();

  const org = useMemo(() => PortalDemoRepository.getOrganizationById(orgId), [orgId, version]);
  const insights = useMemo(() => PortalDemoRepository.getInsights(orgId), [orgId, version]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      
      {/* 顶部标题 */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          <ChartLineUp size={26} className="text-amber-600" />
          <span>基础经营表现看盘</span>
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          真实统计 {org?.name || "当前商户"} 在云游地图游客端的实际曝光、收藏与到访导航数据
        </p>
      </div>

      {/* 三大核心转化漏斗指标 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-sky-600">
            <span className="text-xs font-semibold text-stone-500">1. 游客发现与查看</span>
            <Eye size={22} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-stone-900">{insights.totalViews}</div>
          <p className="text-[11px] text-stone-400">在地图浮窗与发现页查看图文详情的次数</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-xs font-semibold text-stone-500">2. 游客意向收藏</span>
            <BookmarkSimple size={22} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-stone-900">{insights.totalFavorites}</div>
          <p className="text-[11px] text-stone-400">被游客加入个人轻行程与旅行清单的次数</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-semibold text-stone-500">3. 发起路线导航</span>
            <NavigationArrow size={22} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-stone-900">{insights.totalNavigations}</div>
          <p className="text-[11px] text-stone-400">点击“出发导航”调起高德地图路线规划的实际次数</p>
        </div>
      </div>

      {/* 实时访客行为动态流水 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-stone-900">近期游客互动动态流水</h2>

        {insights.recentEvents.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-stone-200 rounded-xl space-y-2">
            <div className="text-xs text-stone-400">暂无游客互动事件</div>
            <p className="text-[11px] text-stone-400">当游客在地图端浏览或收藏您的活动时，将在此处即时记录。</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {insights.recentEvents.map((evt) => {
              const typeMap: Record<string, { label: string; color: string }> = {
                view: { label: "查看了详情", color: "text-sky-700 bg-sky-50" },
                favorite: { label: "加入了收藏", color: "text-rose-700 bg-rose-50" },
                navigation_start: { label: "拉起了导航", color: "text-amber-800 bg-amber-50 font-bold" },
              };
              const info = typeMap[evt.eventType] || { label: evt.eventType, color: "text-stone-700 bg-stone-50" };

              return (
                <div key={evt.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] ${info.color}`}>
                      {info.label}
                    </span>
                    <span className="font-semibold text-stone-800">{evt.entityName}</span>
                  </div>
                  <span className="text-stone-400 text-[11px]">
                    {new Date(evt.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
