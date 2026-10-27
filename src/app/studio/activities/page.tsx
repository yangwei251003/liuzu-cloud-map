"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Activity } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  CalendarCheck,
  Eye,
  CheckCircle,
  XCircle,
  Sparkle,
  PlusCircle,
} from "@phosphor-icons/react";

export default function StudioActivitiesPage() {
  const version = usePortalVersion();
  const activities = useMemo(() => PortalDemoRepository.getActivities(), [version]);

  const handleToggleStatus = (act: Activity) => {
    const newStatus = act.status === "published" ? "unpublished" : "published";
    PortalDemoRepository.saveActivity({
      ...act,
      status: newStatus,
    });
  };

  const handleToggleFeatured = (act: Activity) => {
    PortalDemoRepository.saveActivity({
      ...act,
      featured: !act.featured,
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <CalendarCheck size={26} className="text-indigo-600" />
            <span>文旅体验活动管理</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">管理商户申报的采茶、陶艺、研学及民俗体验活动的上下架状态</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden divide-y divide-stone-100">
        {activities.map((act) => {
          const badge = getStatusBadge(act.status);
          return (
            <div key={act.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${badge.colorClass}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs font-semibold text-stone-400">[{act.category}]</span>
                  <h3 className="font-bold text-stone-900 text-base">{act.name}</h3>
                  {act.featured && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                      推荐位
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 line-clamp-1">{act.summary}</p>
                <div className="flex items-center gap-4 text-[11px] text-stone-400">
                  <span>主办方：{act.organizationName || "商户"}</span>
                  <span>时间：{act.timeDescription}</span>
                  <span>价格：{act.priceText}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleFeatured(act)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    act.featured ? "bg-amber-50 text-amber-800 border border-amber-300" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {act.featured ? "取消推荐" : "设为推荐"}
                </button>

                <button
                  onClick={() => handleToggleStatus(act)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    act.status === "published"
                      ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                >
                  {act.status === "published" ? "下架" : "上架发布"}
                </button>

                <Link
                  href={`/activity/${act.id}`}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium"
                >
                  预览
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
