"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place, Activity, Submission } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  CheckSquareOffset,
  MapPin,
  CalendarCheck,
  Eye,
  BookmarkSimple,
  NavigationArrow,
  ArrowRight,
  Sparkle,
  SlidersHorizontal,
  ClockCounterClockwise,
} from "@phosphor-icons/react";

export default function StudioDashboard() {
  const version = usePortalVersion();

  const places = useMemo(() => PortalDemoRepository.getPlaces(), [version]);
  const activities = useMemo(() => PortalDemoRepository.getActivities(), [version]);
  const submissions = useMemo(() => PortalDemoRepository.getSubmissions(), [version]);
  const insights = useMemo(() => PortalDemoRepository.getInsights(), [version]);

  const pendingList = submissions.filter((s) => s.status === "pending_review");
  const publishedPlaces = places.filter((p) => p.status === "published");
  const publishedActivities = activities.filter((a) => a.status === "published");

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      
      {/* 顶部 Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <span>运营总览仪表盘</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            监控全域文旅资源审核流转、落图发布状态及游客端实时互动表现
          </p>
        </div>

        <Link
          href="/studio/reviews"
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 self-start"
        >
          <CheckSquareOffset size={16} weight="bold" />
          <span>处理待审核 ({pendingList.length})</span>
        </Link>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-semibold text-stone-500">待审核工单</span>
            <CheckSquareOffset size={20} weight="duotone" />
          </div>
          <div className={`text-3xl font-extrabold mt-1 ${pendingList.length > 0 ? "text-amber-600 animate-pulse" : "text-stone-900"}`}>
            {pendingList.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">商户提交待审批</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-semibold text-stone-500">已发布地点/资源</span>
            <MapPin size={20} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-stone-900 mt-1">
            {publishedPlaces.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">全平台已落图地点</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600">
            <span className="text-xs font-semibold text-stone-500">在线文旅体验</span>
            <CalendarCheck size={20} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-stone-900 mt-1">
            {publishedActivities.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">游客可参与活动</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between text-sky-600">
            <span className="text-xs font-semibold text-stone-500">游客互动/导航</span>
            <NavigationArrow size={20} weight="duotone" />
          </div>
          <div className="text-3xl font-extrabold text-sky-600 mt-1">
            {insights.totalNavigations}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">高德导航拉起总量</div>
        </div>
      </div>

      {/* 待办审核队列速览 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">最新待审核提交</h2>
            <p className="text-xs text-stone-500">来自合作社与商户的最新申报条目，需核验资料并落图</p>
          </div>
          <Link
            href="/studio/reviews"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>进入审核中心</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {pendingList.length === 0 ? (
          <div className="text-center py-8 text-xs text-stone-400">
            ✓ 暂无待处理工单，全部提交已完成审核
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {pendingList.map((sub) => (
              <div key={sub.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[11px]">
                      待审核
                    </span>
                    <strong className="text-stone-900 text-sm">{sub.entityTitle}</strong>
                    <span className="text-stone-400">· {sub.organizationName}</span>
                  </div>
                  <p className="text-stone-500">{sub.snapshot.summary}</p>
                </div>

                <Link
                  href={`/studio/reviews`}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg font-bold shrink-0 hover:bg-indigo-500"
                >
                  去审核落图
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 快捷工具入口 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/studio/map-editor"
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs hover:border-indigo-500 transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <SlidersHorizontal size={22} weight="duotone" />
          </div>
          <h3 className="font-bold text-stone-900 text-sm group-hover:text-indigo-600 transition-colors">
            地图点位落图编辑器
          </h3>
          <p className="text-xs text-stone-500">
            在交互地图中直接拖拽打点，校准全平台景区的经纬度坐标与标签
          </p>
        </Link>

        <Link
          href="/studio/featured"
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs hover:border-amber-500 transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Sparkle size={22} weight="duotone" />
          </div>
          <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-600 transition-colors">
            首页与地图推荐位编排
          </h3>
          <p className="text-xs text-stone-500">
            将优质体验活动设为“首页置顶”或“主图推荐”，实时引导客流
          </p>
        </Link>

        <Link
          href="/studio/resources"
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs hover:border-emerald-500 transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MapPin size={22} weight="duotone" />
          </div>
          <h3 className="font-bold text-stone-900 text-sm group-hover:text-emerald-600 transition-colors">
            全域地点与资源台账
          </h3>
          <p className="text-xs text-stone-500">
            集中管理古刹、故居、茶园、温泉等所有实体地点的在线状态与图文
          </p>
        </Link>
      </div>

    </div>
  );
}
