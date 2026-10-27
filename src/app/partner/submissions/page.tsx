"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePortalAuth } from "@/lib/portal/demo-auth-context";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { Submission } from "@/lib/portal/types";
import { getStatusBadge } from "@/lib/portal/content-status-machine";
import {
  ClockCounterClockwise,
  CheckCircle,
  WarningCircle,
  ArrowRight,
  ArrowsClockwise,
  CalendarCheck,
  MapPin,
  Sparkle,
} from "@phosphor-icons/react";

export default function SubmissionsPage() {
  const { user } = usePortalAuth();
  const orgId = user.organizationId || "org-liuzu-tea";
  const version = usePortalVersion();

  const submissions = useMemo(() => PortalDemoRepository.getSubmissions({ organizationId: orgId }), [orgId, version]);
  const [filterStatus, setFilterStatus] = useState<string>("全部");
  const [editingSub, setEditingSub] = useState<Submission | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  const filteredList = submissions.filter((s) => {
    if (filterStatus === "全部") return true;
    return s.status === filterStatus;
  });

  const handleOpenEdit = (sub: Submission) => {
    setEditingSub(sub);
    setResubmitError(null);
    setEditTitle(sub.snapshot.name);
    setEditSummary(sub.snapshot.summary);
  };

  const handleResubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;

    try {
      PortalDemoRepository.resubmitSubmission({
        submissionId: editingSub.id, organizationId: orgId,
        actorName: user.name, actorRole: user.role,
        title: editTitle, summary: editSummary,
      });
    } catch {
      setResubmitError("重新提交失败，请检查所属组织、修改状态与必填内容。");
      return;
    }

    setEditingSub(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      
      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <ClockCounterClockwise size={26} className="text-amber-600" />
            <span>提交记录与审核进度</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            实时查看文旅地点与体验活动的审核时间线、运营批注与发布状态
          </p>
        </div>

        {/* 状态筛选 Tab */}
        <div className="flex items-center gap-1.5 bg-stone-200/80 p-1 rounded-xl text-xs font-medium self-start">
          {["全部", "pending_review", "changes_requested", "published"].map((st) => {
            const labelMap: Record<string, string> = {
              全部: "全部",
              pending_review: "待审核",
              changes_requested: "需修改",
              published: "已发布",
            };
            const active = filterStatus === st;
            return (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  active ? "bg-white text-stone-900 font-bold shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {labelMap[st] || st}
              </button>
            );
          })}
        </div>
      </div>

      {/* 修改弹窗 (Modal) */}
      {editingSub && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-bold text-stone-900 text-base">根据审核意见修改并重新提交</h3>
              <button onClick={() => setEditingSub(null)} className="text-stone-400 hover:text-stone-700 text-sm">✕</button>
            </div>

            <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-xs text-rose-800">
              <strong>运营退回意见：</strong>
              <p className="mt-0.5">{editingSub.reviewNote || "请完善详细信息后重新提交"}</p>
            </div>

            <form onSubmit={handleResubmit} className="space-y-3">
              {resubmitError && <p role="alert" className="text-sm text-rose-700">{resubmitError}</p>}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">项目名称</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">亮点摘要</label>
                <textarea
                  rows={3}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 text-xs font-medium rounded-lg hover:bg-stone-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-500 shadow-sm"
                >
                  确认重新提交审核
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 提交列表 */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-200 shadow-xs space-y-3">
          <ClockCounterClockwise size={32} className="text-stone-400 mx-auto" />
          <div className="text-sm font-semibold text-stone-700">暂无该状态的提交记录</div>
          <p className="text-xs text-stone-400">您可以前往“发布新活动”提交您的第一个文旅项目。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((sub) => {
            const badge = getStatusBadge(sub.status);
            return (
              <div key={sub.id} className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
                
                {/* 条目头部 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${badge.colorClass}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-stone-400">
                      {sub.entityType === "activity" ? "文旅体验" : "地点门店"}
                    </span>
                    <h3 className="font-bold text-stone-900 text-base">{sub.entityTitle}</h3>
                  </div>

                  <div className="text-xs text-stone-400">
                    提交时间：{new Date(sub.submittedAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>

                {/* 审核反馈及操作 */}
                {sub.status === "changes_requested" && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-rose-900 flex items-center gap-1">
                        <WarningCircle size={15} weight="fill" className="text-rose-600" />
                        <span>运营退回修改意见：</span>
                      </div>
                      <p className="text-rose-800">{sub.reviewNote || "请补充相关材料与说明"}</p>
                    </div>
                    <button
                      onClick={() => handleOpenEdit(sub)}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shrink-0 transition-colors"
                    >
                      重新修改并提交
                    </button>
                  </div>
                )}

                {sub.status === "published" && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-900">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={17} weight="fill" className="text-emerald-600" />
                      <span>已正式发布上线！游客可在地图与发现页查看并导航。</span>
                    </div>
                    <Link
                      href={sub.entityType === "activity" ? `/activity/${sub.entityId}` : `/place/${sub.entityId}`}
                      className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1"
                    >
                      <span>前往游客端查看</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}

                {/* 审核生命周期时间线 (History) */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-stone-500">流转历史时间线：</div>
                  <div className="space-y-2 border-l-2 border-stone-200 ml-2 pl-3 text-xs">
                    {sub.history.map((h) => (
                      <div key={h.id} className="relative space-y-0.5">
                        <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-white" />
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-800">{h.actionName}</span>
                          <span className="text-stone-400">· {h.actorName} ({h.actorRole})</span>
                          <span className="text-stone-400 text-[11px]">
                            {new Date(h.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}
                          </span>
                        </div>
                        {h.note && <p className="text-stone-600 text-[11px] bg-stone-50 p-1.5 rounded mt-0.5">{h.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
