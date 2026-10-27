"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { PortalRole } from "@/lib/portal/types";
import {
  Compass,
  Storefront,
  SlidersHorizontal,
  ArrowsCounterClockwise,
  ArrowRight,
  Sparkle,
  MapPin,
  CalendarCheck,
  Eye,
  BookmarkSimple,
  NavigationArrow,
} from "@phosphor-icons/react";

function getJudgeStats() {
  const places = PortalDemoRepository.getPlaces({ status: "published" });
  const activities = PortalDemoRepository.getActivities({ status: "published" });
  const pending = PortalDemoRepository.getSubmissions({ status: "pending_review" });
  const insights = PortalDemoRepository.getInsights();
  return {
    placesCount: places.length,
    activitiesCount: activities.length,
    pendingSubmissions: pending.length,
    totalViews: insights.totalViews,
    totalFavorites: insights.totalFavorites,
    totalNavigations: insights.totalNavigations,
  };
}

export default function JudgeControlCenter() {
  const { switchRole } = usePortalAuth();
  const router = useRouter();
  const version = usePortalVersion();
  const stats = useMemo(() => getJudgeStats(), [version]);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleEnterRole = (targetRole: PortalRole, targetPath: string) => {
    switchRole(targetRole);
    router.push(targetPath);
  };

  const handleResetData = () => {
    if (confirm("确定要将演示数据恢复为初始状态吗？所有新增商户活动将重置为初始状态。")) {
      PortalDemoRepository.resetToSeedData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* 顶部 Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-amber-500/40">
                评委阶段性演示环境
              </span>
              <span className="text-xs text-stone-400">Antigravity Multi-Portal MVP</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>云游地图 · 三端协同演示中枢</span>
            </h1>
            <p className="mt-2 text-sm text-stone-400 leading-relaxed max-w-2xl">
              把分散的县域文旅资源变成
              <span className="text-amber-400 font-medium"> 可提交、可审核、可落图、可发现、可导航、可运营 </span>
              的数字化资产，支撑多角色实时闭环协同。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetData}
              className="flex items-center gap-1.5 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-medium rounded-lg border border-stone-700 transition-colors shadow-sm"
            >
              <ArrowsCounterClockwise size={16} className={resetSuccess ? "animate-spin text-emerald-400" : ""} />
              <span>{resetSuccess ? "已重置为初始数据" : "恢复初始演示数据"}</span>
            </button>
          </div>
        </div>

        {/* 当前系统实时状态指标 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">已上线地点</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.placesCount}</div>
          </div>
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">已上线体验</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.activitiesCount}</div>
          </div>
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">待审核工单</div>
            <div className={`text-2xl font-bold mt-1 ${stats.pendingSubmissions > 0 ? "text-amber-400 animate-pulse" : "text-stone-300"}`}>
              {stats.pendingSubmissions}
            </div>
          </div>
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">游客查看次数</div>
            <div className="text-2xl font-bold text-sky-400 mt-1">{stats.totalViews}</div>
          </div>
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">游客收藏量</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{stats.totalFavorites}</div>
          </div>
          <div className="bg-stone-800/80 p-3.5 rounded-xl border border-stone-700/60">
            <div className="text-xs text-stone-400">导航启动数</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{stats.totalNavigations}</div>
          </div>
        </div>

        {/* 三端独立卡片入口 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. 商户端 */}
          <div className="bg-stone-800/90 border border-stone-700/80 rounded-2xl p-6 flex flex-col justify-between hover:border-amber-500/50 transition-all hover:shadow-xl group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Storefront size={26} weight="duotone" />
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-700 text-stone-300">
                  商户 / 合作社
                </span>
              </div>
              <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                1. 云游伙伴中心
              </h2>
              <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                面向景区内商户、非遗工坊、农旅合作社与民宿，提供零门槛入驻、活动提交向导与审核进度透明化追踪。
              </p>

              <div className="mt-4 pt-4 border-t border-stone-700/60 space-y-2 text-xs text-stone-300">
                <div className="font-semibold text-stone-200">推荐演示动作：</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-400">①</span>
                  <span>进入发布向导，在地图上选点定位</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-400">②</span>
                  <span>填写秋季采茶/陶艺体验并提交审核</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-amber-400">③</span>
                  <span>查看状态时间线与数据看盘</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4">
              <button
                onClick={() => handleEnterRole("partner", "/partner/workbench")}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                <span>以演示商户身份进入</span>
                <ArrowRight size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* 2. Studio 管理端 */}
          <div className="bg-stone-800/90 border border-stone-700/80 rounded-2xl p-6 flex flex-col justify-between hover:border-indigo-500/50 transition-all hover:shadow-xl group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <SlidersHorizontal size={26} weight="duotone" />
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-700 text-stone-300">
                  管理与创作
                </span>
              </div>
              <h2 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                2. 云游 Studio
              </h2>
              <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                面向景区管理人员与文旅运营人员，统一处理入驻审核、地图落图微调、内容发布与首页推荐位编排。
              </p>

              <div className="mt-4 pt-4 border-t border-stone-700/60 space-y-2 text-xs text-stone-300">
                <div className="font-semibold text-stone-200">推荐演示动作：</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-indigo-400">①</span>
                  <span>在待审核列表查看商户刚提交的活动</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-indigo-400">②</span>
                  <span>在分屏地图编辑器中校准坐标经纬度</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-indigo-400">③</span>
                  <span>审核通过并发布，勾选“首页推荐”</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4">
              <button
                onClick={() => handleEnterRole("studio", "/studio/reviews")}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                <span>以运营人员身份进入</span>
                <ArrowRight size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* 3. 游客端 */}
          <div className="bg-stone-800/90 border border-stone-700/80 rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/50 transition-all hover:shadow-xl group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Compass size={26} weight="duotone" />
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-700 text-stone-300">
                  大众游客端
                </span>
              </div>
              <h2 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                3. 云游地图 (游客端)
              </h2>
              <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                面向大众游客，以高德真实地图为载体，即时发现已发布的文旅资源与在地体验，支持轻行程与导航拉起。
              </p>

              <div className="mt-4 pt-4 border-t border-stone-700/60 space-y-2 text-xs text-stone-300">
                <div className="font-semibold text-stone-200">推荐演示动作：</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-400">①</span>
                  <span>在地图或发现页即时看到刚发布的活动</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-400">②</span>
                  <span>点击气泡查看详情卡片并“加入收藏”</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-400">③</span>
                  <span>点击“出发导航”，调起高德路线规划</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4">
              <button
                onClick={() => handleEnterRole("visitor", "/map")}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
              >
                <span>以游客身份进入地图</span>
                <ArrowRight size={16} weight="bold" />
              </button>
            </div>
          </div>

        </div>

        {/* 5分钟黄金路径演示指引 */}
        <div className="bg-stone-800/40 border border-stone-700/60 rounded-2xl p-6">
          <h3 className="text-base font-bold text-amber-300 flex items-center gap-2 mb-4">
            <Sparkle size={18} weight="fill" />
            <span>评委 5 分钟黄金演示路径速查</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-stone-800/80 p-3 rounded-xl border border-stone-700/40">
              <div className="text-amber-400 font-semibold mb-1">第 1 步：商户发布体验</div>
              <p className="text-stone-300 leading-relaxed">
                进入伙伴中心，创建“禅茶制茶体验”，在地图上点选茶园并提交审核。
              </p>
            </div>
            <div className="bg-stone-800/80 p-3 rounded-xl border border-stone-700/40">
              <div className="text-indigo-400 font-semibold mb-1">第 2 步：Studio 审核落图</div>
              <p className="text-stone-300 leading-relaxed">
                切到 Studio 审核中心，审查资料并微调地图点位，点击“通过并发布”。
              </p>
            </div>
            <div className="bg-stone-800/80 p-3 rounded-xl border border-stone-700/40">
              <div className="text-emerald-400 font-semibold mb-1">第 3 步：游客发现与导航</div>
              <p className="text-stone-300 leading-relaxed">
                切到游客端地图，即刻查看到新活动卡片，完成收藏并发起路线导航。
              </p>
            </div>
            <div className="bg-stone-800/80 p-3 rounded-xl border border-stone-700/40">
              <div className="text-sky-400 font-semibold mb-1">第 4 步：数据回流验证</div>
              <p className="text-stone-300 leading-relaxed">
                回到商户端工作台，查看刚刚游客产生的浏览与导航事件实时累加。
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
