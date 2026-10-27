"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Place, Activity, Submission, Organization } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  PlusCircle,
  ClockCounterClockwise,
  MapPin,
  CalendarCheck,
  Eye,
  NavigationArrow,
  CheckCircle,
  WarningCircle,
  Sparkle,
  ArrowRight,
  Storefront,
  Tag,
} from "@phosphor-icons/react";

export default function PartnerWorkbench() {
  const { user } = usePortalAuth();
  const orgId = user.organizationId || "org-liuzu-tea";
  const version = usePortalVersion();

  const org = useMemo(() => PortalDemoRepository.getOrganizationById(orgId) || null, [orgId, version]);
  const places = useMemo(() => PortalDemoRepository.getPlaces({ organizationId: orgId }), [orgId, version]);
  const activities = useMemo(() => PortalDemoRepository.getActivities({ organizationId: orgId }), [orgId, version]);
  const submissions = useMemo(() => PortalDemoRepository.getSubmissions({ organizationId: orgId }), [orgId, version]);
  const insights = useMemo(() => PortalDemoRepository.getInsights(orgId), [orgId, version]);

  const pendingSubmissions = submissions.filter((s) => s.status === "pending_review");
  const rejectedSubmissions = submissions.filter((s) => s.status === "changes_requested");

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* 顶部商户信息卡 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center font-bold text-xl shrink-0">
            <Storefront size={28} weight="duotone" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-stone-900">{org?.name || "六祖镇禅茶生态种植合作社"}</h1>
              <span className="bg-emerald-50 text-emerald-800 text-xs px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
                已认证合作社
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">{org?.summary}</p>
            <div className="flex items-center gap-4 text-xs text-stone-400 mt-2">
              <span>联系人：{org?.contactName} ({org?.contactPhone})</span>
              <span>所在区域：{org?.region}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/partner/activities/new"
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <PlusCircle size={17} weight="bold" />
            <span>发布新活动</span>
          </Link>
          <Link
            href="/partner/resources/new"
            className="px-3.5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-sm rounded-xl transition-all border border-stone-200 flex items-center gap-1.5"
          >
            <span>登记新地点</span>
          </Link>
        </div>
      </div>

      {/* 待办提醒 Banner（若有待修改工单） */}
      {rejectedSubmissions.length > 0 ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <WarningCircle size={24} weight="fill" className="text-rose-600 shrink-0" />
            <div>
              <div className="font-bold text-rose-900 text-sm">
                有 {rejectedSubmissions.length} 项提交收到运营审核意见，需修改后重新提交
              </div>
              <div className="text-xs text-rose-700 mt-0.5">
                审核意见：“{rejectedSubmissions[0].reviewNote || "请补充更清晰的活动图片与具体时间说明"}”
              </div>
            </div>
          </div>
          <Link
            href="/partner/submissions"
            className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-500 shrink-0"
          >
            立即查看并修改
          </Link>
        </div>
      ) : null}

      {/* 数据表现概览卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-medium">我的文旅活动</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{activities.length}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">已发布上线 {activities.filter(a => a.status === "published").length} 项</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-medium">我的地点/基地</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{places.length}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">已上图 {places.filter(p => p.status === "published").length} 处</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-medium">游客查看次数</div>
          <div className="text-2xl font-bold text-sky-600 mt-1 flex items-center gap-1">
            <Eye size={20} />
            <span>{insights.totalViews}</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">包含地图卡片与详情浏览</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs text-stone-500 font-medium">导航引导到访</div>
          <div className="text-2xl font-bold text-amber-600 mt-1 flex items-center gap-1">
            <NavigationArrow size={20} />
            <span>{insights.totalNavigations}</span>
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">高德路线规划拉起次数</div>
        </div>
      </div>

      {/* 我的文旅体验活动列表 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-900">我的文旅体验活动</h2>
            <p className="text-xs text-stone-500">已上线的活动会即时呈现在游客端“发现”和“今日体验”中</p>
          </div>
          <Link
            href="/partner/activities/new"
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            <span>+ 新增体验活动</span>
          </Link>
        </div>

        {activities.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-stone-300 rounded-xl space-y-3">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <CalendarCheck size={24} />
            </div>
            <div className="text-sm font-semibold text-stone-700">暂未发布文旅体验活动</div>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">发布采摘、制茶、陶艺、研学等体验活动，吸引更多到访游客。</p>
            <Link
              href="/partner/activities/new"
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium"
            >
              <span>立即发布第一场活动</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {activities.map((act) => {
              const badge = getStatusBadge(act.status);
              return (
                <div key={act.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      <h3 className="font-bold text-stone-900 text-sm">{act.name}</h3>
                      {act.featured ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">
                          推荐位
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-stone-500 line-clamp-1">{act.summary}</p>
                    <div className="flex items-center gap-4 text-[11px] text-stone-400">
                      <span>类目：{act.category}</span>
                      <span>时间：{act.timeDescription}</span>
                      <span>价格：{act.priceText}</span>
                      <span>预约：{act.bookingMethod}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {act.status === "published" ? (
                      <Link
                        href={`/activity/${act.id}`}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-lg transition-colors"
                      >
                        游客端预览
                      </Link>
                    ) : (
                      <Link
                        href="/partner/submissions"
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium rounded-lg transition-colors"
                      >
                        查看审核详情
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 我的地点与基地 */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-900">我的地点与基地</h2>
            <p className="text-xs text-stone-500">在地图上直观展现您的种植园、工坊或实体门店</p>
          </div>
          <Link
            href="/partner/resources/new"
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            <span>+ 登记新地点</span>
          </Link>
        </div>

        {places.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-stone-300 rounded-xl space-y-2">
            <div className="text-xs text-stone-400">暂无独立登记的基地地点</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {places.map((place) => {
              const badge = getStatusBadge(place.status);
              return (
                <div key={place.id} className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-md border ${badge.colorClass}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-stone-400">{place.category}</span>
                  </div>
                  <h4 className="font-bold text-stone-900 text-sm">{place.name}</h4>
                  <p className="text-xs text-stone-500 line-clamp-1">{place.address}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
