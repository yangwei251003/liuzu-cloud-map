"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Submission, ContentStatus } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  CheckSquareOffset,
  CheckCircle,
  XCircle,
  WarningCircle,
  MapPin,
  Sparkle,
  Eye,
  CalendarCheck,
  Phone,
  CurrencyCny,
  ArrowRight,
} from "@phosphor-icons/react";

export default function StudioReviewsPage() {
  const { user } = usePortalAuth();
  const version = usePortalVersion();
  const submissions = useMemo(() => PortalDemoRepository.getSubmissions(), [version]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<string>("pending_review");

  const selectedSub = useMemo(() => {
    if (selectedId) {
      const match = submissions.find((s) => s.id === selectedId);
      if (match) return match;
    }
    return submissions.find((s) => s.status === "pending_review") || submissions[0] || null;
  }, [submissions, selectedId]);

  // 审核表单状态
  const [reviewNote, setReviewNote] = useState("");
  const [setFeatured, setSetFeatured] = useState(true);
  const [editLat, setEditLat] = useState(22.5882);
  const [editLng, setEditLng] = useState(112.2315);
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  const handleSelectSubmission = (sub: Submission) => {
    setSelectedId(sub.id);
    setEditLat(sub.snapshot.latitude);
    setEditLng(sub.snapshot.longitude);
    setReviewNote("");
  };

  const handleExecuteReview = (action: "approve" | "publish" | "request_changes" | "reject") => {
    if (!selectedSub) return;
    if ((action === "request_changes" || action === "reject") && !reviewNote.trim()) {
      alert("请填写退回或拒绝的具体原因说明。");
      return;
    }

    const updated = PortalDemoRepository.reviewSubmission({
      submissionId: selectedSub.id,
      action,
      reviewerName: user.name,
      reviewerRole: "studio",
      note: reviewNote || (action === "publish" ? "审核通过并正式发布" : "审核通过"),
      setFeatured: setFeatured,
      overrideLocation: {
        latitude: editLat,
        longitude: editLng,
        gcj02: [editLng + 0.0051, editLat - 0.0029],
      },
    });

    setActionSuccessMsg(
      action === "publish"
        ? "✓ 已正式发布上线！游客端地图与发现流已即时同步。"
        : action === "request_changes"
        ? "✓ 已退回给商户并附带修改意见。"
        : "✓ 审核状态已更新。"
    );
    setTimeout(() => setActionSuccessMsg(""), 3500);
  };

  const filteredList = submissions.filter((s) => {
    if (filterTab === "all") return true;
    return s.status === filterTab;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl h-full flex flex-col">
      
      {/* 顶部 Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <CheckSquareOffset size={26} className="text-indigo-600" />
            <span>文旅资源与活动审核中心</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            审核商户入驻申报、校准地图经纬度落图、控制上架发布与首页推荐位
          </p>
        </div>

        {/* 状态 Tabs */}
        <div className="flex items-center gap-1.5 bg-stone-200/80 p-1 rounded-xl text-xs font-semibold">
          {[
            { key: "pending_review", label: "待审核" },
            { key: "published", label: "已发布" },
            { key: "changes_requested", label: "需修改" },
            { key: "all", label: "全部工单" },
          ].map((tab) => {
            const active = filterTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  active ? "bg-white text-indigo-950 shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 animate-fade-in">
          <CheckCircle size={17} weight="fill" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* 主体双栏：左侧工单列表，右侧审核详情与落图微调 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        
        {/* 左侧列表 (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden flex flex-col max-h-[750px]">
          <div className="p-3.5 bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700 flex items-center justify-between">
            <span>申报工单列表 ({filteredList.length})</span>
            <span className="text-stone-400 font-normal">点击选择审查</span>
          </div>

          <div className="divide-y divide-stone-100 overflow-y-auto flex-1">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-400">
                暂无此分类工单
              </div>
            ) : (
              filteredList.map((sub) => {
                const badge = getStatusBadge(sub.status);
                const isSelected = selectedSub?.id === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => handleSelectSubmission(sub)}
                    className={`p-4 cursor-pointer transition-all space-y-1.5 ${
                      isSelected
                        ? "bg-indigo-50/70 border-l-4 border-indigo-600"
                        : "hover:bg-stone-50 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {new Date(sub.submittedAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="font-bold text-stone-900 text-sm leading-snug line-clamp-1">
                      {sub.entityTitle}
                    </div>
                    <div className="text-xs text-stone-500 line-clamp-1">
                      {sub.organizationName}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧审核工作台 (8 cols) */}
        {selectedSub ? (
          <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 shadow-xs p-6 space-y-6">
            
            {/* 条目头部信息 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${getStatusBadge(selectedSub.status).colorClass}`}>
                    {getStatusBadge(selectedSub.status).label}
                  </span>
                  <h2 className="text-xl font-bold text-stone-900">{selectedSub.entityTitle}</h2>
                </div>
                <div className="text-xs text-stone-500 mt-1 flex items-center gap-3">
                  <span>申报主体：<strong>{selectedSub.organizationName}</strong></span>
                  <span>提交人：{selectedSub.submittedBy}</span>
                  <span>类型：{selectedSub.entityType === "activity" ? "文旅体验" : "地点门店"}</span>
                </div>
              </div>

              {selectedSub.status === "published" && (
                <Link
                  href={selectedSub.entityType === "activity" ? `/activity/${selectedSub.entityId}` : `/place/${selectedSub.entityId}`}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-100 border border-emerald-300 flex items-center gap-1 self-start"
                >
                  <span>游客端查看</span>
                  <ArrowRight size={13} />
                </Link>
              )}
            </div>

            {/* 图文与经营资料展示 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                1. 商户申报图文与经营要素
              </h3>
              
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-stone-700">项目亮点摘要：</span>
                  <p className="text-stone-800 mt-0.5 leading-relaxed">{selectedSub.snapshot.summary}</p>
                </div>

                <div>
                  <span className="font-semibold text-stone-700">详细游玩流程说明：</span>
                  <p className="text-stone-600 mt-0.5 leading-relaxed">{selectedSub.snapshot.description}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200">
                  <div>
                    <span className="text-stone-400 block">费用说明</span>
                    <strong className="text-stone-900">{selectedSub.snapshot.priceText}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">开放营业时间</span>
                    <span className="text-stone-800">
                      {"timeDescription" in selectedSub.snapshot ? selectedSub.snapshot.timeDescription : selectedSub.snapshot.openingHours}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block">预约方式</span>
                    <span className="text-stone-800">
                      {"bookingMethod" in selectedSub.snapshot ? selectedSub.snapshot.bookingMethod : "现场接待"}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block">联系电话</span>
                    <span className="text-stone-800">{selectedSub.snapshot.contact}</span>
                  </div>
                </div>

                {/* 申报照片预览 */}
                {selectedSub.snapshot.images && selectedSub.snapshot.images.length > 0 ? (
                  <div className="pt-2">
                    <span className="font-semibold text-stone-700 block mb-1.5">申报实景图片：</span>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {selectedSub.snapshot.images.map((img, idx) => (
                        <div key={idx} className="w-24 h-18 rounded-lg overflow-hidden shrink-0 border border-stone-300">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 地图落图坐标校准 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center justify-between">
                <span>2. 地图落图坐标校准（高德坐标系）</span>
                <span className="text-emerald-700 font-normal">支持直接修改经纬度</span>
              </h3>

              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-600 block">落图纬度 (Latitude)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editLat}
                      onChange={(e) => setEditLat(parseFloat(e.target.value) || editLat)}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-600 block">落图经度 (Longitude)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={editLng}
                      onChange={(e) => setEditLng(parseFloat(e.target.value) || editLng)}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="text-xs text-stone-500 flex items-center gap-2">
                  <MapPin size={15} className="text-indigo-600" />
                  <span>当前落图位置：{selectedSub.snapshot.address}</span>
                </div>
              </div>
            </div>

            {/* 审核操作区 */}
            <div className="space-y-4 pt-2 border-t border-stone-200">
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                3. 填写审核批注与执行动作
              </h3>

              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="填写审核意见（如：通过理由、或需商户补充哪些照片与说明）..."
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs focus:bg-white focus:border-indigo-600"
                />

                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-stone-700">
                    <input
                      type="checkbox"
                      checked={setFeatured}
                      onChange={(e) => setSetFeatured(e.target.checked)}
                      className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>同时设为“首页与地图推荐位”（突出展示）</span>
                  </label>
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecuteReview("request_changes")}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-xl border border-rose-300 transition-colors flex items-center gap-1.5"
                  >
                    <WarningCircle size={15} weight="bold" />
                    <span>要求商户修改</span>
                  </button>
                  <button
                    onClick={() => handleExecuteReview("reject")}
                    className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-xl border border-stone-300 transition-colors"
                  >
                    <span>拒绝申请</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecuteReview("approve")}
                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-300 transition-colors"
                  >
                    <span>仅通过审核</span>
                  </button>
                  <button
                    onClick={() => handleExecuteReview("publish")}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5"
                  >
                    <CheckCircle size={16} weight="fill" />
                    <span>审核通过并立即发布</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 p-12 text-center text-xs text-stone-400">
            请从左侧选择一条工单进行审查
          </div>
        )}

      </div>

    </div>
  );
}

