"use client";

import {
  ArrowLeft,
  Archive,
  CheckCircle,
  ClockCountdown,
  CloudSlash,
  DownloadSimple,
  FileText,
  Gavel,
  GlobeHemisphereEast,
  ListChecks,
  MapTrifold,
  NotePencil,
  Plus,
  SealCheck,
  ShieldCheck,
  SpeakerHigh,
  Trash,
  UserFocus,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ADMIN_GOVERNANCE_STORAGE_KEY,
  adminGovernanceHasContent,
  allowedCorrectionTransitions,
  clearAdminGovernanceData,
  createAdminId,
  createAuditLog,
  createDemoAdminGovernanceData,
  createEmptyAdminGovernanceData,
  expectedEditorRole,
  expectedReviewerRole,
  exportAdminGovernanceJson,
  getEffectiveWorkflowState,
  readAdminGovernanceData,
  recordName,
  submitCorrection,
  transitionCorrectionTicket,
  transitionGovernedRecord,
  writeAdminGovernanceData,
  type Actor,
  type AdminGovernanceData,
  type AdminRole,
  type AuditLog,
  type CorrectionState,
  type CorrectionTicket,
  type FactType,
  type GisObjectType,
  type GisReleaseItem,
  type GovernedRecord,
  type KnowledgeClaim,
  type NarrationAsset,
  type OperationalStatus,
  type RightsStatus,
  type WorkflowAction,
} from "@/lib/admin-governance-store";

type Section = "overview" | "operations" | "content" | "gis" | "narration" | "corrections" | "audit";

const fieldClass =
  "w-full rounded-xl border border-[#173f35]/15 bg-white/75 px-3.5 py-3 text-sm text-[#173f35] outline-none transition-colors placeholder:text-[#7b8983] focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-2.5 text-sm font-semibold text-[#fffaf0] transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 bg-white/60 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40";

const roleInfo: Record<AdminRole, { label: string; duty: string }> = {
  OPERATION_EDITOR: { label: "运营状态编辑", duty: "录入来源、责任人和有效期；只能提交，不能审核或发布。" },
  CONTENT_EDITOR: { label: "内容编辑", duty: "拆分命题、标注事实类型和证据；不能审核自己的提交。" },
  GIS_EDITOR: { label: "GIS 编辑", duty: "登记空间对象、坐标系、来源与核验依据。" },
  NARRATION_EDITOR: { label: "讲解资产编辑", duty: "登记脚本版本、来源和权利状态。" },
  OPERATION_REVIEWER: { label: "运营专业审核", duty: "核验运营状态的来源、责任人和有效期，不能发布。" },
  CONTENT_REVIEWER: { label: "内容专业审核", duty: "对文化命题与证据作出通过或驳回结论，不能发布。" },
  GIS_REVIEWER: { label: "GIS 专业审核", duty: "核验对象类型、坐标系和空间证据，不能发布。" },
  RIGHTS_REVIEWER: { label: "权利专业审核", duty: "确认讲解素材权利清晰后作出审核结论，不能发布。" },
  RELEASE_ADMIN: { label: "独立发布管理员", duty: "只能发布已审核版本或撤回已发布版本，不能替代专业审核。" },
  CORRECTION_COORDINATOR: { label: "纠错协调员", duty: "分诊、指派并闭环游客纠错，不改变专业审核结论。" },
};

const stateLabel = {
  DRAFT: "草稿",
  IN_REVIEW: "审核中",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  PUBLISHED: "已发布",
  WITHDRAWN: "已撤回",
  EXPIRED: "已过期",
} as const;

const correctionLabel: Record<CorrectionState, string> = {
  RECEIVED: "已接收",
  TRIAGED: "已分诊",
  ASSIGNED: "已指派",
  NEEDS_INFO: "待补充",
  ACCEPTED: "已采纳",
  REJECTED: "未采纳",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
};

const factTypeLabel: Record<FactType, string> = {
  OFFICIAL_CURRENT: "官方现状",
  HISTORICAL_RECORD: "历史记载",
  RELIGIOUS_TRADITION: "宗教传统",
  LOCAL_LEGEND: "地方传说",
  INTERPRETATION: "解释性表达",
  MARKETING_CLAIM: "营销表述",
  UGC_EXPERIENCE: "游客体验",
  REALTIME_STATUS: "实时状态",
};

const sections: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "总览", icon: <ListChecks size={17} aria-hidden="true" /> },
  { id: "operations", label: "运营状态", icon: <ClockCountdown size={17} aria-hidden="true" /> },
  { id: "content", label: "内容命题", icon: <FileText size={17} aria-hidden="true" /> },
  { id: "gis", label: "GIS 发布", icon: <MapTrifold size={17} aria-hidden="true" /> },
  { id: "narration", label: "讲解资产", icon: <SpeakerHigh size={17} aria-hidden="true" /> },
  { id: "corrections", label: "游客纠错", icon: <NotePencil size={17} aria-hidden="true" /> },
  { id: "audit", label: "审计日志", icon: <Archive size={17} aria-hidden="true" /> },
];

type OperationForm = Pick<OperationalStatus, "subject" | "value" | "source" | "owner" | "validFrom" | "validUntil">;
type ClaimForm = Pick<KnowledgeClaim, "claim" | "factType" | "evidence" | "source" | "owner" | "validUntil">;
type GisForm = Pick<GisReleaseItem, "name" | "objectType" | "coordinateSystem" | "evidence" | "source" | "owner" | "validUntil">;
type NarrationForm = Pick<NarrationAsset, "title" | "placeName" | "scriptVersion" | "evidence" | "source" | "owner" | "rightsStatus" | "validUntil">;

const emptyOperation: OperationForm = { subject: "", value: "", source: "", owner: "", validFrom: "", validUntil: "" };
const emptyClaim: ClaimForm = { claim: "", factType: "OFFICIAL_CURRENT", evidence: "", source: "", owner: "", validUntil: "" };
const emptyGis: GisForm = { name: "", objectType: "POI", coordinateSystem: "GCJ-02（待核验）", evidence: "", source: "", owner: "", validUntil: "" };
const emptyNarration: NarrationForm = { title: "", placeName: "", scriptVersion: "draft-0.1", evidence: "", source: "", owner: "", rightsStatus: "PENDING", validUntil: "" };

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function replaceGovernedRecord(data: AdminGovernanceData, item: GovernedRecord, audit: AuditLog): AdminGovernanceData {
  const base = { ...data, auditLogs: [audit, ...data.auditLogs], updatedAt: audit.at };
  switch (item.kind) {
    case "OPERATION":
      return { ...base, operations: data.operations.map((current) => (current.id === item.id ? item : current)) };
    case "KNOWLEDGE":
      return { ...base, claims: data.claims.map((current) => (current.id === item.id ? item : current)) };
    case "GIS":
      return { ...base, gisItems: data.gisItems.map((current) => (current.id === item.id ? item : current)) };
    case "NARRATION":
      return { ...base, narrations: data.narrations.map((current) => (current.id === item.id ? item : current)) };
  }
}

function workflowStateClass(state: keyof typeof stateLabel): string {
  if (state === "PUBLISHED") return "border-[#2f7d62]/25 bg-[#dcece4] text-[#235e4c]";
  if (state === "APPROVED") return "border-[#5d8a71]/25 bg-[#e8efe8] text-[#416a55]";
  if (state === "IN_REVIEW") return "border-[#b88a43]/30 bg-[#f3e7ce] text-[#7c5b25]";
  if (state === "EXPIRED" || state === "REJECTED") return "border-[#a85749]/25 bg-[#f4dfda] text-[#8f4238]";
  if (state === "WITHDRAWN") return "border-[#5f6763]/20 bg-[#e5e7e5] text-[#555f5a]";
  return "border-[#173f35]/15 bg-white/65 text-[#54655e]";
}

function EmptyState({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[#173f35]/20 bg-white/35 px-5 py-9 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#173f35]/7 text-[#9b7a42]">{icon}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-6 text-[#64756d]">{description}</p>
    </div>
  );
}

function FormPanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.7rem] border border-[#173f35]/10 bg-white/48 p-5 shadow-[0_20px_55px_rgba(34,65,53,.07)] md:p-6">
      <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#9b7a42]">{eyebrow}</span>
      <h3 className="mt-2 text-xl font-semibold tracking-[-.025em]">{title}</h3>
      {children}
    </div>
  );
}

function RecordDetails({ item }: { item: GovernedRecord }) {
  if (item.kind === "OPERATION") {
    return <p className="mt-3 text-sm leading-6 text-[#53675e]"><strong>当前值：</strong>{item.value} · {item.validFrom} 至 {item.validUntil}</p>;
  }
  if (item.kind === "KNOWLEDGE") {
    return <p className="mt-3 text-sm leading-6 text-[#53675e]"><strong>事实类型：</strong>{factTypeLabel[item.factType]}<br /><strong>证据：</strong>{item.evidence}</p>;
  }
  if (item.kind === "GIS") {
    return <p className="mt-3 text-sm leading-6 text-[#53675e]"><strong>对象：</strong>{item.objectType} · {item.coordinateSystem}<br /><strong>核验依据：</strong>{item.evidence}</p>;
  }
  return <p className="mt-3 text-sm leading-6 text-[#53675e]"><strong>地点 / 版本：</strong>{item.placeName} · {item.scriptVersion}<br /><strong>权利：</strong>{item.rightsStatus} · {item.evidence}</p>;
}

function GovernedRecordCard({
  item,
  actor,
  note,
  onNoteChange,
  onAction,
  onEditOperation,
}: {
  item: GovernedRecord;
  actor: Actor;
  note: string;
  onNoteChange: (value: string) => void;
  onAction: (action: WorkflowAction) => void;
  onEditOperation?: (item: OperationalStatus) => void;
}) {
  const effectiveState = getEffectiveWorkflowState(item);
  const needsNote = item.state === "IN_REVIEW" || item.state === "PUBLISHED";
  const expectedSubmitter = expectedEditorRole(item.kind);
  const expectedReviewer = expectedReviewerRole(item.kind);

  return (
    <article className="rounded-[1.5rem] border border-[#173f35]/10 bg-white/55 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${workflowStateClass(effectiveState)}`}>{stateLabel[effectiveState]}</span>
            <span className="text-[11px] text-[#77857e]">修订 {item.revision}</span>
          </div>
          <h3 className="mt-3 break-words text-lg font-semibold">{recordName(item)}</h3>
        </div>
        {item.kind === "OPERATION" && onEditOperation && (item.state === "DRAFT" || item.state === "REJECTED") && (
          <button type="button" onClick={() => onEditOperation(item)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#173f35]/12 px-3 text-xs font-semibold">
            <NotePencil size={15} aria-hidden="true" />编辑草稿
          </button>
        )}
      </div>
      <RecordDetails item={item} />
      <dl className="mt-4 grid gap-2 border-t border-[#173f35]/9 pt-4 text-xs text-[#66776f] sm:grid-cols-2">
        <div><dt className="font-semibold text-[#3e564c]">来源</dt><dd className="mt-1 break-words">{item.source}</dd></div>
        <div><dt className="font-semibold text-[#3e564c]">责任人 / 有效期</dt><dd className="mt-1">{item.owner} · {item.validUntil || "长期"}</dd></div>
      </dl>

      {item.reviewDecision && (
        <div className="mt-4 rounded-xl bg-[#173f35]/5 px-4 py-3 text-xs leading-5 text-[#53675e]">
          <strong>{item.reviewDecision.decision === "APPROVED" ? "审核通过" : "审核驳回"}</strong> · {item.reviewDecision.reviewerName}（{roleInfo[item.reviewDecision.reviewerRole].label}）
          <br />{item.reviewDecision.note}
        </div>
      )}
      {item.publication && (
        <p className="mt-3 text-xs text-[#4f6c60]">发布：{item.publication.publisherName} · {formatDateTime(item.publication.publishedAt)}</p>
      )}
      {item.withdrawal && (
        <p className="mt-3 text-xs text-[#8f4238]">撤回：{item.withdrawal.withdrawnBy} · {item.withdrawal.reason}</p>
      )}

      {needsNote && (
        <div className="mt-4 grid gap-2">
          <label htmlFor={`workflow-note-${item.id}`} className="text-xs font-semibold">
            {item.state === "IN_REVIEW" ? "审核结论说明" : "撤回原因"}
          </label>
          <input id={`workflow-note-${item.id}`} value={note} onChange={(event) => onNoteChange(event.target.value)} className={fieldClass} maxLength={500} placeholder={item.state === "IN_REVIEW" ? "说明核验依据或驳回原因" : "说明为何撤回已发布版本"} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(item.state === "DRAFT" || item.state === "REJECTED") && (
          <button type="button" onClick={() => onAction("SUBMIT")} disabled={actor.role !== expectedSubmitter || effectiveState === "EXPIRED"} title={`需切换为${roleInfo[expectedSubmitter].label}`} className={secondaryButtonClass}>
            <SealCheck size={17} aria-hidden="true" />提交审核
          </button>
        )}
        {item.state === "IN_REVIEW" && (
          <>
            <button type="button" onClick={() => onAction("APPROVE")} disabled={actor.role !== expectedReviewer} title={`需切换为${roleInfo[expectedReviewer].label}`} className={primaryButtonClass}>
              <CheckCircle size={17} aria-hidden="true" />通过
            </button>
            <button type="button" onClick={() => onAction("REJECT")} disabled={actor.role !== expectedReviewer} title={`需切换为${roleInfo[expectedReviewer].label}`} className={secondaryButtonClass}>驳回</button>
          </>
        )}
        {item.state === "APPROVED" && (
          <button type="button" onClick={() => onAction("PUBLISH")} disabled={actor.role !== "RELEASE_ADMIN" || effectiveState === "EXPIRED"} title="需由独立发布管理员执行" className={primaryButtonClass}>
            <GlobeHemisphereEast size={17} aria-hidden="true" />发布已审核版本
          </button>
        )}
        {item.state === "PUBLISHED" && (
          <button type="button" onClick={() => onAction("WITHDRAW")} disabled={actor.role !== "RELEASE_ADMIN"} title="需由发布管理员执行" className={secondaryButtonClass}>
            <Archive size={17} aria-hidden="true" />撤回发布
          </button>
        )}
        {effectiveState === "EXPIRED" && <span className="self-center text-xs font-medium text-[#8f4238]">有效期已过，更新后必须重新审核。</span>}
      </div>
    </article>
  );
}

function LoadingAdmin() {
  return (
    <main className="paper-noise min-h-[100dvh] px-4 py-8 md:px-8" aria-busy="true" aria-label="正在读取本地治理数据">
      <div className="mx-auto max-w-[1400px] animate-pulse">
        <div className="h-11 w-40 rounded-full bg-[#173f35]/8" />
        <div className="mt-14 h-12 max-w-xl rounded bg-[#173f35]/8" />
        <div className="mt-6 h-20 max-w-3xl rounded bg-[#173f35]/8" />
        <div className="mt-12 grid gap-5 lg:grid-cols-[17rem_1fr]"><div className="h-80 rounded-[1.7rem] bg-[#173f35]/8" /><div className="h-96 rounded-[1.7rem] bg-[#173f35]/8" /></div>
      </div>
      <span className="sr-only">正在读取保存在此设备上的运营治理记录。</span>
    </main>
  );
}

export function AdminGovernance() {
  const [data, setData] = useState<AdminGovernanceData>(createEmptyAdminGovernanceData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [actorName, setActorName] = useState("原型操作者");
  const [actorRole, setActorRole] = useState<AdminRole>("OPERATION_EDITOR");
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [clearConfirming, setClearConfirming] = useState(false);
  const [operationForm, setOperationForm] = useState<OperationForm>(emptyOperation);
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState<ClaimForm>(emptyClaim);
  const [gisForm, setGisForm] = useState<GisForm>(emptyGis);
  const [narrationForm, setNarrationForm] = useState<NarrationForm>(emptyNarration);
  const [correctionForm, setCorrectionForm] = useState({ subject: "", detail: "", category: "CONTENT" as CorrectionTicket["category"], priority: "MEDIUM" as CorrectionTicket["priority"], reporterAlias: "匿名游客" });
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, { owner: string; nextState: CorrectionState; note: string }>>({});

  useEffect(() => {
    const load = () => {
      const result = readAdminGovernanceData();
      setData(result.data);
      setError(result.error);
      setLoading(false);
    };
    load();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_GOVERNANCE_STORAGE_KEY || event.key === null) {
        load();
        setNotice("已同步此设备另一页面中的治理更新。");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const actor = useMemo<Actor>(() => ({ name: actorName.trim(), role: actorRole }), [actorName, actorRole]);
  const allGoverned = useMemo<GovernedRecord[]>(() => [...data.operations, ...data.claims, ...data.gisItems, ...data.narrations], [data]);
  const metrics = useMemo(() => ({
    review: allGoverned.filter((item) => item.state === "IN_REVIEW").length,
    approved: allGoverned.filter((item) => item.state === "APPROVED").length,
    published: allGoverned.filter((item) => item.state === "PUBLISHED" && getEffectiveWorkflowState(item) !== "EXPIRED").length,
    expired: allGoverned.filter((item) => getEffectiveWorkflowState(item) === "EXPIRED").length,
    corrections: data.corrections.filter((ticket) => ticket.state !== "CLOSED").length,
  }), [allGoverned, data.corrections]);

  function commit(next: AdminGovernanceData, message: string): boolean {
    const result = writeAdminGovernanceData(next);
    if (!result.ok) {
      setError(result.error);
      setNotice(null);
      return false;
    }
    setData(next);
    setError(null);
    setNotice(message);
    return true;
  }

  function requireActor(role: AdminRole): boolean {
    if (!actor.name) {
      setError("请先填写当前操作者姓名或岗位代号。");
      return false;
    }
    if (actor.role !== role) {
      setError(`当前操作需要“${roleInfo[role].label}”角色。`);
      return false;
    }
    return true;
  }

  function handleWorkflow(item: GovernedRecord, action: WorkflowAction) {
    const result = transitionGovernedRecord(item, action, actor, actionNotes[item.id] ?? "");
    if (!result.ok) {
      setError(result.error);
      setNotice(null);
      return;
    }
    const next = replaceGovernedRecord(data, result.item, result.audit);
    if (commit(next, `“${recordName(item)}”已${stateLabel[result.item.state]}，并写入本机审计日志。`)) {
      setActionNotes((current) => ({ ...current, [item.id]: "" }));
    }
  }

  function createBase<Kind extends GovernedRecord["kind"]>(kind: Kind, owner: string, now: string) {
    return {
      id: createAdminId(kind.toLowerCase()),
      kind,
      state: "DRAFT" as const,
      source: "",
      owner,
      revision: 1,
      lastEditedBy: actor.name,
      reviewDecision: null,
      publication: null,
      withdrawal: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireActor("OPERATION_EDITOR")) return;
    if (!Object.values(operationForm).every((value) => value.trim())) {
      setError("运营状态的主题、当前值、来源、责任人和有效期都必须填写。");
      return;
    }
    const now = new Date().toISOString();
    const existing = data.operations.find((item) => item.id === editingOperationId);
    if (existing && existing.state !== "DRAFT" && existing.state !== "REJECTED") {
      setError("审核中或已发布的版本不可直接编辑；请先完成流程或撤回后新建修订。");
      return;
    }
    const item: OperationalStatus = existing
      ? { ...existing, ...operationForm, state: "DRAFT", revision: existing.revision + 1, lastEditedBy: actor.name, reviewDecision: null, publication: null, withdrawal: null, updatedAt: now }
      : { ...createBase("OPERATION", operationForm.owner, now), ...operationForm };
    const audit = createAuditLog({ entityKind: "OPERATION", entityId: item.id, entityName: item.subject, action: existing ? "UPDATED" : "CREATED", actorName: actor.name, actorRole: actor.role, fromState: existing?.state ?? null, toState: "DRAFT", note: existing ? "编辑后生成待重新审核的草稿修订。" : "创建运营状态草稿。", at: now });
    const operations = existing ? data.operations.map((current) => current.id === item.id ? item : current) : [item, ...data.operations];
    if (commit({ ...data, operations, auditLogs: [audit, ...data.auditLogs], updatedAt: now }, existing ? "运营状态已更新为新草稿，原审核结论已清空。" : "运营状态草稿已创建。")) {
      setOperationForm(emptyOperation);
      setEditingOperationId(null);
    }
  }

  function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireActor("CONTENT_EDITOR")) return;
    if (!claimForm.claim.trim() || !claimForm.evidence.trim() || !claimForm.source.trim() || !claimForm.owner.trim() || !claimForm.validUntil) {
      setError("命题、事实类型、证据、来源、责任人和有效期都必须填写。");
      return;
    }
    const now = new Date().toISOString();
    const item: KnowledgeClaim = { ...createBase("KNOWLEDGE", claimForm.owner, now), ...claimForm };
    const audit = createAuditLog({ entityKind: "KNOWLEDGE", entityId: item.id, entityName: item.claim, action: "CREATED", actorName: actor.name, actorRole: actor.role, fromState: null, toState: "DRAFT", note: "创建内容命题草稿。", at: now });
    if (commit({ ...data, claims: [item, ...data.claims], auditLogs: [audit, ...data.auditLogs], updatedAt: now }, "内容命题草稿已创建。")) setClaimForm(emptyClaim);
  }

  function submitGis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireActor("GIS_EDITOR")) return;
    if (!gisForm.name.trim() || !gisForm.coordinateSystem.trim() || !gisForm.evidence.trim() || !gisForm.source.trim() || !gisForm.owner.trim() || !gisForm.validUntil) {
      setError("GIS 名称、对象类型、坐标系、核验依据、来源、责任人和有效期都必须填写。");
      return;
    }
    const now = new Date().toISOString();
    const item: GisReleaseItem = { ...createBase("GIS", gisForm.owner, now), ...gisForm };
    const audit = createAuditLog({ entityKind: "GIS", entityId: item.id, entityName: item.name, action: "CREATED", actorName: actor.name, actorRole: actor.role, fromState: null, toState: "DRAFT", note: "创建 GIS 发布草稿。", at: now });
    if (commit({ ...data, gisItems: [item, ...data.gisItems], auditLogs: [audit, ...data.auditLogs], updatedAt: now }, "GIS 发布草稿已创建。")) setGisForm(emptyGis);
  }

  function submitNarration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireActor("NARRATION_EDITOR")) return;
    if (!narrationForm.title.trim() || !narrationForm.placeName.trim() || !narrationForm.scriptVersion.trim() || !narrationForm.evidence.trim() || !narrationForm.source.trim() || !narrationForm.owner.trim() || !narrationForm.validUntil) {
      setError("讲解标题、地点、版本、证据、来源、责任人、权利状态和有效期都必须填写。");
      return;
    }
    const now = new Date().toISOString();
    const item: NarrationAsset = { ...createBase("NARRATION", narrationForm.owner, now), ...narrationForm };
    const audit = createAuditLog({ entityKind: "NARRATION", entityId: item.id, entityName: item.title, action: "CREATED", actorName: actor.name, actorRole: actor.role, fromState: null, toState: "DRAFT", note: "创建讲解资产草稿。", at: now });
    if (commit({ ...data, narrations: [item, ...data.narrations], auditLogs: [audit, ...data.auditLogs], updatedAt: now }, "讲解资产草稿已创建。")) setNarrationForm(emptyNarration);
  }

  function submitCorrectionForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submitCorrection(correctionForm);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
    setError(null);
    setNotice(`纠错“${result.ticket.subject}”已进入本机队列。`);
    setCorrectionForm({ subject: "", detail: "", category: "CONTENT", priority: "MEDIUM", reporterAlias: "匿名游客" });
  }

  function updateCorrection(ticket: CorrectionTicket) {
    const draft = correctionDrafts[ticket.id] ?? { owner: ticket.owner, nextState: allowedCorrectionTransitions(ticket.state)[0] ?? ticket.state, note: "" };
    const result = transitionCorrectionTicket(ticket, draft.nextState, draft.owner, actor, draft.note);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = { ...data, corrections: data.corrections.map((current) => current.id === ticket.id ? result.ticket : current), auditLogs: [result.audit, ...data.auditLogs], updatedAt: result.audit.at };
    if (commit(next, `纠错“${ticket.subject}”已更新为${correctionLabel[result.ticket.state]}。`)) {
      setCorrectionDrafts((current) => { const copy = { ...current }; delete copy[ticket.id]; return copy; });
    }
  }

  function beginEditOperation(item: OperationalStatus) {
    setOperationForm({ subject: item.subject, value: item.value, source: item.source, owner: item.owner, validFrom: item.validFrom, validUntil: item.validUntil });
    setEditingOperationId(item.id);
    setSection("operations");
    document.querySelector("#operation-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function retryLoad() {
    setLoading(true);
    const result = readAdminGovernanceData();
    setData(result.data);
    setError(result.error);
    setLoading(false);
    if (!result.error) setNotice("已重新读取本机治理数据。");
  }

  function clearAll() {
    const result = clearAdminGovernanceData();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(createEmptyAdminGovernanceData());
    setClearConfirming(false);
    setError(null);
    setNotice("本机治理数据已清除；此操作不影响任何线上系统。");
  }

  function loadDemo() {
    const demo = createDemoAdminGovernanceData();
    if (commit(demo, "已载入明确标记的演示数据；它们不代表景区事实。")) setSection("overview");
  }

  function exportData() {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`六祖云游-本机治理导出-${date}.json`, exportAdminGovernanceJson(data));
    setNotice("本机治理数据与审计日志已导出为 JSON。");
  }

  if (loading) return <LoadingAdmin />;

  const governedProps = (item: GovernedRecord) => ({
    item,
    actor,
    note: actionNotes[item.id] ?? "",
    onNoteChange: (value: string) => setActionNotes((current) => ({ ...current, [item.id]: value })),
    onAction: (action: WorkflowAction) => handleWorkflow(item, action),
  });

  return (
    <main className="paper-noise min-h-[100dvh] overflow-hidden pb-14">
      <header className="sticky top-0 z-40 border-b border-[#173f35]/10 bg-[#f7f1e7]/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold" aria-label="返回六祖云游首页">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-[#173f35]/12 bg-white/55"><ArrowLeft size={18} aria-hidden="true" /></span>
            <span className="hidden sm:inline">返回游客端</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#b88a43]/25 bg-white/55 px-3 py-2 text-xs font-semibold text-[#6d624e]"><CloudSlash size={16} weight="duotone" aria-hidden="true" />本机治理原型</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-10 pt-12 md:px-8 md:pt-18 lg:grid-cols-[1.12fr_.88fr]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[.22em] text-[#9b7a42]">Operations governance desk</span>
          <h1 className="mt-4 max-w-[13ch] text-4xl font-semibold leading-[1.02] tracking-[-.055em] md:text-6xl">先有证据，再有发布</h1>
          <p className="mt-6 max-w-[65ch] text-base leading-8 text-[#607169]">把运营现状、文化命题、空间数据与讲解资产放进同一条审核链。过期内容自动标识，未审核版本无法发布，审核人与发布管理员必须分离。</p>
        </div>
        <aside className="self-end rounded-[2rem] bg-[#173f35] p-6 text-[#fffaf0] shadow-[0_28px_70px_rgba(23,63,53,.17)] md:p-7">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#d4b57b]" size={28} weight="duotone" aria-hidden="true" /><div><h2 className="font-semibold">原型边界</h2><p className="mt-2 text-sm leading-6 text-white/65">角色切换只用于验证流程，不是真实登录鉴权。本页不连接数据库、供应商、正式发布通道或线上审计系统。</p></div></div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={exportData} disabled={!adminGovernanceHasContent(data)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/18 px-4 text-sm font-semibold disabled:opacity-35"><DownloadSimple size={17} aria-hidden="true" />导出 JSON</button>
            {!clearConfirming ? (
              <button type="button" onClick={() => setClearConfirming(true)} disabled={!adminGovernanceHasContent(data)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4b57b]/35 px-4 text-sm font-semibold text-[#eedbb5] disabled:opacity-35"><Trash size={17} aria-hidden="true" />清除本机数据</button>
            ) : (
              <span className="inline-flex gap-2" role="group" aria-label="确认清除本机治理数据"><button type="button" onClick={clearAll} className="min-h-11 rounded-full bg-[#fffaf0] px-4 text-sm font-semibold text-[#173f35]">确认清除</button><button type="button" onClick={() => setClearConfirming(false)} className="grid h-11 w-11 place-items-center rounded-full border border-white/18" aria-label="取消清除"><X size={17} /></button></span>
            )}
          </div>
        </aside>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 md:px-8" aria-label="治理概览">
        <dl className="grid grid-cols-2 divide-x divide-y divide-[#173f35]/12 border-y border-[#173f35]/12 sm:grid-cols-5 sm:divide-y-0">
          {[["待专业审核", metrics.review], ["待发布", metrics.approved], ["有效发布", metrics.published], ["自动过期", metrics.expired], ["开放纠错", metrics.corrections]].map(([label, value]) => (
            <div key={label} className="px-4 py-4 sm:px-5"><dt className="text-xs text-[#718078]">{label}</dt><dd className="mt-1 text-2xl font-semibold tracking-[-.04em]">{value}</dd></div>
          ))}
        </dl>
      </section>

      {(error || notice) && (
        <section className="mx-auto max-w-[1400px] px-4 pt-6 md:px-8" aria-live="polite">
          {error ? <div className="flex flex-col gap-3 rounded-2xl border border-[#a85749]/20 bg-[#f5e2de] p-4 text-sm text-[#823c34] sm:flex-row sm:items-center sm:justify-between" role="alert"><span className="flex items-start gap-2"><WarningCircle className="mt-0.5 shrink-0" size={19} />{error}</span><span className="flex gap-2"><button type="button" onClick={retryLoad} className="min-h-10 rounded-full border border-[#823c34]/20 px-3 font-semibold">重试读取</button><button type="button" onClick={() => setError(null)} className="min-h-10 rounded-full border border-[#823c34]/20 px-3 font-semibold">关闭提示</button></span></div> : <div className="flex items-start gap-2 rounded-2xl border border-[#47745f]/18 bg-[#e2ede6] p-4 text-sm text-[#365f4d]"><CheckCircle className="mt-0.5 shrink-0" size={19} />{notice}</div>}
        </section>
      )}

      <section className="mx-auto grid max-w-[1400px] gap-6 px-4 py-10 md:px-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-[1.7rem] border border-[#173f35]/10 bg-white/48 p-4 lg:sticky lg:top-24">
          <div className="rounded-2xl bg-[#173f35] p-4 text-[#fffaf0]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#d4b57b]"><UserFocus size={17} aria-hidden="true" />当前演示角色</div>
            <label htmlFor="actor-name" className="mt-4 block text-xs font-semibold text-white/70">操作者姓名 / 岗位代号</label>
            <input id="actor-name" value={actorName} onChange={(event) => setActorName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#d4b57b]" maxLength={60} />
            <label htmlFor="actor-role" className="mt-4 block text-xs font-semibold text-white/70">职责角色</label>
            <select id="actor-role" value={actorRole} onChange={(event) => setActorRole(event.target.value as AdminRole)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#244f44] px-3 py-2.5 text-sm text-white outline-none focus:border-[#d4b57b]">
              {Object.entries(roleInfo).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
            <p className="mt-4 border-t border-white/12 pt-4 text-xs leading-5 text-white/62">{roleInfo[actorRole].duty}</p>
          </div>
          <nav className="mt-4 grid gap-1" aria-label="治理后台分区">
            {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors ${section === item.id ? "bg-[#e5eadf] text-[#173f35]" : "text-[#607169] hover:bg-white/70"}`}>{item.icon}<span>{item.label}</span></button>)}
          </nav>
        </aside>

        <div className="min-w-0">
          {section === "overview" && (
            <div>
              <div className="flex flex-col gap-4 border-b border-[#173f35]/12 pb-7 sm:flex-row sm:items-end sm:justify-between"><div><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Control plane</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.045em] md:text-5xl">治理链路总览</h2></div><div className="flex flex-wrap gap-2"><Link href="/admin/route-operations" className={secondaryButtonClass}><WarningCircle size={17} aria-hidden="true" />道路运营管制</Link><Link href="/admin/gis-review" className={secondaryButtonClass}><Gavel size={17} aria-hidden="true" />GIS 专业审核</Link><Link href="/admin/gis-formalization" className={secondaryButtonClass}><MapTrifold size={17} aria-hidden="true" />GIS 正式化</Link><Link href="/admin/readiness" className={secondaryButtonClass}><ShieldCheck size={17} aria-hidden="true" />正式发布证据预检</Link>{!adminGovernanceHasContent(data) && <button type="button" onClick={loadDemo} className={secondaryButtonClass}><Plus size={17} aria-hidden="true" />载入非事实演示数据</button>}</div></div>
              <div className="mt-8 grid gap-5 md:grid-cols-2">
                {[
                  ["01", "编辑留痕", "编辑者补齐来源、证据、责任人和有效期，只能产生草稿。"],
                  ["02", "专业审核", "领域审核人独立给出结论；编辑者不能审核自己的条目。"],
                  ["03", "原子发布", "发布管理员只能发布已通过的当前修订，且不能与审核人为同一人。"],
                  ["04", "撤回与过期", "撤回必须说明原因；到期条目自动标为过期并阻断再发布。"],
                ].map(([index, title, copy]) => <article key={index} className="rounded-[1.5rem] border border-[#173f35]/10 bg-white/50 p-5"><span className="text-xs font-semibold text-[#b88a43]">{index}</span><h3 className="mt-5 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[#607169]">{copy}</p></article>)}
              </div>
              <div className="mt-7 rounded-[1.7rem] border border-[#b88a43]/20 bg-[#f1e7d2]/65 p-5 md:p-6"><div className="flex items-start gap-3"><Gavel className="mt-0.5 shrink-0 text-[#9b7a42]" size={24} weight="duotone" aria-hidden="true" /><div><h3 className="font-semibold">职责分离提示</h3><p className="mt-2 text-sm leading-6 text-[#685f50]">当前角色下拉框只是流程演示器。生产环境必须由服务端身份与权限系统强制执行职责分离，并将审计日志写入不可由普通运营人员修改的存储。本机 localStorage 可被用户改写，不能作为合规证据。</p></div></div></div>
            </div>
          )}

          {section === "operations" && (
            <div>
              <div className="border-b border-[#173f35]/12 pb-6"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Live operations</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">运营状态与有效期</h2><p className="mt-3 text-sm leading-6 text-[#607169]">开放信息、服务状态和临时安排必须随来源与期限一起维护。</p></div>
              <div className="mt-7 grid gap-7 xl:grid-cols-[.82fr_1.18fr]">
                <FormPanel eyebrow={editingOperationId ? "Edit revision" : "New status"} title={editingOperationId ? "编辑并生成新修订" : "登记运营状态草稿"}>
                  <form id="operation-form" onSubmit={submitOperation} className="mt-5 grid gap-4" noValidate>
                    <label className="grid gap-2 text-sm font-semibold" htmlFor="operation-subject">状态主题<input id="operation-subject" className={fieldClass} value={operationForm.subject} onChange={(event) => setOperationForm((current) => ({ ...current, subject: event.target.value }))} placeholder="例如：某服务点开放状态" maxLength={100} /></label>
                    <label className="grid gap-2 text-sm font-semibold" htmlFor="operation-value">当前值<input id="operation-value" className={fieldClass} value={operationForm.value} onChange={(event) => setOperationForm((current) => ({ ...current, value: event.target.value }))} placeholder="请写明确、可核验的状态" maxLength={160} /></label>
                    <label className="grid gap-2 text-sm font-semibold" htmlFor="operation-source">来源<input id="operation-source" className={fieldClass} value={operationForm.source} onChange={(event) => setOperationForm((current) => ({ ...current, source: event.target.value }))} placeholder="官方通知标题、编号或采集记录" maxLength={300} /></label>
                    <label className="grid gap-2 text-sm font-semibold" htmlFor="operation-owner">责任人<input id="operation-owner" className={fieldClass} value={operationForm.owner} onChange={(event) => setOperationForm((current) => ({ ...current, owner: event.target.value }))} placeholder="岗位或姓名" maxLength={80} /></label>
                    <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="operation-from">生效日期<input id="operation-from" type="date" className={fieldClass} value={operationForm.validFrom} onChange={(event) => setOperationForm((current) => ({ ...current, validFrom: event.target.value }))} /></label><label className="grid gap-2 text-sm font-semibold" htmlFor="operation-until">有效至<input id="operation-until" type="date" className={fieldClass} value={operationForm.validUntil} onChange={(event) => setOperationForm((current) => ({ ...current, validUntil: event.target.value }))} /></label></div>
                    <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButtonClass}><Plus size={17} aria-hidden="true" />{editingOperationId ? "保存新修订" : "创建草稿"}</button>{editingOperationId && <button type="button" onClick={() => { setEditingOperationId(null); setOperationForm(emptyOperation); }} className={secondaryButtonClass}>取消编辑</button>}</div>
                  </form>
                </FormPanel>
                <div className="grid content-start gap-4">{data.operations.length === 0 ? <EmptyState icon={<ClockCountdown size={23} />} title="暂无运营状态" description="用左侧表单登记第一条带来源、责任人与有效期的运营信息。" /> : data.operations.map((item) => <GovernedRecordCard key={item.id} {...governedProps(item)} onEditOperation={beginEditOperation} />)}</div>
              </div>
            </div>
          )}

          {section === "content" && (
            <div>
              <div className="border-b border-[#173f35]/12 pb-6"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Knowledge claims</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">内容命题与证据</h2><p className="mt-3 text-sm leading-6 text-[#607169]">一句可发布表述就是一个命题；事实、传说、解释与体验必须分型。</p></div>
              <div className="mt-7 grid gap-7 xl:grid-cols-[.82fr_1.18fr]">
                <FormPanel eyebrow="New claim" title="创建命题草稿"><form onSubmit={submitClaim} className="mt-5 grid gap-4" noValidate>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="claim-text">命题<textarea id="claim-text" rows={3} className={fieldClass} value={claimForm.claim} onChange={(event) => setClaimForm((current) => ({ ...current, claim: event.target.value }))} placeholder="只写一个可独立审核的陈述" maxLength={500} /></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="claim-type">事实类型<select id="claim-type" className={fieldClass} value={claimForm.factType} onChange={(event) => setClaimForm((current) => ({ ...current, factType: event.target.value as FactType }))}>{Object.entries(factTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="claim-evidence">证据<textarea id="claim-evidence" rows={3} className={fieldClass} value={claimForm.evidence} onChange={(event) => setClaimForm((current) => ({ ...current, evidence: event.target.value }))} placeholder="页码、公告编号、原文位置或核验说明" maxLength={800} /></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="claim-source">来源<input id="claim-source" className={fieldClass} value={claimForm.source} onChange={(event) => setClaimForm((current) => ({ ...current, source: event.target.value }))} placeholder="一手来源名称与链接或档案号" maxLength={300} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="claim-owner">责任人<input id="claim-owner" className={fieldClass} value={claimForm.owner} onChange={(event) => setClaimForm((current) => ({ ...current, owner: event.target.value }))} maxLength={80} /></label><label className="grid gap-2 text-sm font-semibold" htmlFor="claim-until">有效至<input id="claim-until" type="date" className={fieldClass} value={claimForm.validUntil} onChange={(event) => setClaimForm((current) => ({ ...current, validUntil: event.target.value }))} /></label></div>
                  <button type="submit" className={primaryButtonClass}><Plus size={17} aria-hidden="true" />创建命题草稿</button>
                </form></FormPanel>
                <div className="grid content-start gap-4">{data.claims.length === 0 ? <EmptyState icon={<FileText size={23} />} title="暂无内容命题" description="把待发布表述拆成最小命题，并逐条登记事实类型、来源与证据。" /> : data.claims.map((item) => <GovernedRecordCard key={item.id} {...governedProps(item)} />)}</div>
              </div>
            </div>
          )}

          {section === "gis" && (
            <div>
              <div className="border-b border-[#173f35]/12 pb-6"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Spatial releases</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">GIS 发布条目</h2><p className="mt-3 text-sm leading-6 text-[#607169]">边界、入口、路径、设施与 POI 分条核验，不能把坐标系推测当成事实。</p></div>
              <div className="mt-7 grid gap-7 xl:grid-cols-[.82fr_1.18fr]">
                <FormPanel eyebrow="New spatial item" title="创建 GIS 草稿"><form onSubmit={submitGis} className="mt-5 grid gap-4" noValidate>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="gis-name">条目名称<input id="gis-name" className={fieldClass} value={gisForm.name} onChange={(event) => setGisForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="gis-type">对象类型<select id="gis-type" className={fieldClass} value={gisForm.objectType} onChange={(event) => setGisForm((current) => ({ ...current, objectType: event.target.value as GisObjectType }))}>{["BOUNDARY", "ENTRANCE", "PATH", "FACILITY", "POI"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold" htmlFor="gis-crs">坐标系<input id="gis-crs" className={fieldClass} value={gisForm.coordinateSystem} onChange={(event) => setGisForm((current) => ({ ...current, coordinateSystem: event.target.value }))} maxLength={80} /></label></div>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="gis-evidence">核验依据<textarea id="gis-evidence" rows={3} className={fieldClass} value={gisForm.evidence} onChange={(event) => setGisForm((current) => ({ ...current, evidence: event.target.value }))} maxLength={800} /></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="gis-source">数据来源<input id="gis-source" className={fieldClass} value={gisForm.source} onChange={(event) => setGisForm((current) => ({ ...current, source: event.target.value }))} maxLength={300} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="gis-owner">责任人<input id="gis-owner" className={fieldClass} value={gisForm.owner} onChange={(event) => setGisForm((current) => ({ ...current, owner: event.target.value }))} maxLength={80} /></label><label className="grid gap-2 text-sm font-semibold" htmlFor="gis-until">有效至<input id="gis-until" type="date" className={fieldClass} value={gisForm.validUntil} onChange={(event) => setGisForm((current) => ({ ...current, validUntil: event.target.value }))} /></label></div>
                  <button type="submit" className={primaryButtonClass}><Plus size={17} aria-hidden="true" />创建 GIS 草稿</button>
                </form></FormPanel>
                <div className="grid content-start gap-4">{data.gisItems.length === 0 ? <EmptyState icon={<MapTrifold size={23} />} title="暂无 GIS 条目" description="登记对象类型、明确坐标系并附上空间核验依据后，再进入专业审核。" /> : data.gisItems.map((item) => <GovernedRecordCard key={item.id} {...governedProps(item)} />)}</div>
              </div>
            </div>
          )}

          {section === "narration" && (
            <div>
              <div className="border-b border-[#173f35]/12 pb-6"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Narration assets</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">讲解资产状态</h2><p className="mt-3 text-sm leading-6 text-[#607169]">脚本版本、内容依据与素材权利共同构成可审核的讲解资产。</p></div>
              <div className="mt-7 grid gap-7 xl:grid-cols-[.82fr_1.18fr]">
                <FormPanel eyebrow="New narration" title="创建讲解资产草稿"><form onSubmit={submitNarration} className="mt-5 grid gap-4" noValidate>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="narration-title">资产标题<input id="narration-title" className={fieldClass} value={narrationForm.title} onChange={(event) => setNarrationForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="narration-place">关联地点<input id="narration-place" className={fieldClass} value={narrationForm.placeName} onChange={(event) => setNarrationForm((current) => ({ ...current, placeName: event.target.value }))} maxLength={100} /></label><label className="grid gap-2 text-sm font-semibold" htmlFor="narration-version">脚本版本<input id="narration-version" className={fieldClass} value={narrationForm.scriptVersion} onChange={(event) => setNarrationForm((current) => ({ ...current, scriptVersion: event.target.value }))} maxLength={60} /></label></div>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="narration-evidence">内容与权利依据<textarea id="narration-evidence" rows={3} className={fieldClass} value={narrationForm.evidence} onChange={(event) => setNarrationForm((current) => ({ ...current, evidence: event.target.value }))} maxLength={800} /></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="narration-source">来源<input id="narration-source" className={fieldClass} value={narrationForm.source} onChange={(event) => setNarrationForm((current) => ({ ...current, source: event.target.value }))} maxLength={300} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="narration-rights">权利状态<select id="narration-rights" className={fieldClass} value={narrationForm.rightsStatus} onChange={(event) => setNarrationForm((current) => ({ ...current, rightsStatus: event.target.value as RightsStatus }))}>{["PENDING", "CLEARED", "RESTRICTED", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold" htmlFor="narration-until">有效至<input id="narration-until" type="date" className={fieldClass} value={narrationForm.validUntil} onChange={(event) => setNarrationForm((current) => ({ ...current, validUntil: event.target.value }))} /></label></div>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="narration-owner">责任人<input id="narration-owner" className={fieldClass} value={narrationForm.owner} onChange={(event) => setNarrationForm((current) => ({ ...current, owner: event.target.value }))} maxLength={80} /></label>
                  <button type="submit" className={primaryButtonClass}><Plus size={17} aria-hidden="true" />创建讲解草稿</button>
                </form></FormPanel>
                <div className="grid content-start gap-4">{data.narrations.length === 0 ? <EmptyState icon={<SpeakerHigh size={23} />} title="暂无讲解资产" description="登记脚本版本与权利依据；只有权利状态明确的资产才能通过审核。" /> : data.narrations.map((item) => <GovernedRecordCard key={item.id} {...governedProps(item)} />)}</div>
              </div>
            </div>
          )}

          {section === "corrections" && (
            <div>
              <div className="border-b border-[#173f35]/12 pb-6"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Correction queue</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">游客纠错闭环</h2><p className="mt-3 text-sm leading-6 text-[#607169]">接收不等于采纳；每条纠错需要分诊、责任人、结论与关闭记录。</p></div>
              <div className="mt-7 grid gap-7 xl:grid-cols-[.78fr_1.22fr]">
                <FormPanel eyebrow="Visitor intake" title="模拟提交游客纠错"><form onSubmit={submitCorrectionForm} className="mt-5 grid gap-4" noValidate>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="correction-subject">主题<input id="correction-subject" className={fieldClass} value={correctionForm.subject} onChange={(event) => setCorrectionForm((current) => ({ ...current, subject: event.target.value }))} maxLength={120} /></label>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="correction-detail">问题描述<textarea id="correction-detail" rows={4} className={fieldClass} value={correctionForm.detail} onChange={(event) => setCorrectionForm((current) => ({ ...current, detail: event.target.value }))} maxLength={2000} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-semibold" htmlFor="correction-category">分类<select id="correction-category" className={fieldClass} value={correctionForm.category} onChange={(event) => setCorrectionForm((current) => ({ ...current, category: event.target.value as CorrectionTicket["category"] }))}>{["OPERATION", "CONTENT", "GIS", "NARRATION", "OTHER"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold" htmlFor="correction-priority">优先级<select id="correction-priority" className={fieldClass} value={correctionForm.priority} onChange={(event) => setCorrectionForm((current) => ({ ...current, priority: event.target.value as CorrectionTicket["priority"] }))}>{["LOW", "MEDIUM", "HIGH"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
                  <label className="grid gap-2 text-sm font-semibold" htmlFor="correction-reporter">游客署名<input id="correction-reporter" className={fieldClass} value={correctionForm.reporterAlias} onChange={(event) => setCorrectionForm((current) => ({ ...current, reporterAlias: event.target.value }))} maxLength={60} /></label>
                  <button type="submit" className={primaryButtonClass}><Plus size={17} aria-hidden="true" />进入纠错队列</button>
                </form></FormPanel>
                <div className="grid content-start gap-4">{data.corrections.length === 0 ? <EmptyState icon={<NotePencil size={23} />} title="纠错队列为空" description="游客提交后先进入“已接收”，由纠错协调员分诊并推动闭环。" /> : data.corrections.map((ticket) => {
                  const options = allowedCorrectionTransitions(ticket.state);
                  const draft = correctionDrafts[ticket.id] ?? { owner: ticket.owner, nextState: options[0] ?? ticket.state, note: "" };
                  return <article key={ticket.id} className="rounded-[1.5rem] border border-[#173f35]/10 bg-white/55 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-[#173f35]/14 bg-white/65 px-2.5 py-1 text-[11px] font-semibold">{correctionLabel[ticket.state]}</span><span className="text-[11px] text-[#78857f]">{ticket.priority} · {ticket.category}</span></div><h3 className="mt-3 text-lg font-semibold">{ticket.subject}</h3><p className="mt-2 text-sm leading-6 text-[#607169]">{ticket.detail}</p><p className="mt-3 text-xs text-[#78857f]">提交：{ticket.reporterAlias} · {formatDateTime(ticket.createdAt)}{ticket.owner ? ` · 责任人：${ticket.owner}` : ""}</p>{options.length > 0 ? <div className="mt-5 grid gap-3 border-t border-[#173f35]/9 pt-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-semibold" htmlFor={`correction-next-${ticket.id}`}>下一状态<select id={`correction-next-${ticket.id}`} className={fieldClass} value={draft.nextState} onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [ticket.id]: { ...draft, nextState: event.target.value as CorrectionState } }))}>{options.map((value) => <option key={value} value={value}>{correctionLabel[value]}</option>)}</select></label><label className="grid gap-2 text-xs font-semibold" htmlFor={`correction-owner-${ticket.id}`}>责任人<input id={`correction-owner-${ticket.id}`} className={fieldClass} value={draft.owner} onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [ticket.id]: { ...draft, owner: event.target.value } }))} maxLength={80} /></label><label className="grid gap-2 text-xs font-semibold sm:col-span-2" htmlFor={`correction-note-${ticket.id}`}>处理说明<input id={`correction-note-${ticket.id}`} className={fieldClass} value={draft.note} onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [ticket.id]: { ...draft, note: event.target.value } }))} maxLength={500} /></label><button type="button" onClick={() => updateCorrection(ticket)} disabled={actor.role !== "CORRECTION_COORDINATOR"} title="需切换为纠错协调员" className={`${primaryButtonClass} sm:col-span-2`}>推进工单</button></div> : <p className="mt-4 border-t border-[#173f35]/9 pt-4 text-xs font-semibold text-[#537064]">该工单已结束，无后续状态。</p>}</article>;
                })}</div>
              </div>
            </div>
          )}

          {section === "audit" && (
            <div>
              <div className="flex flex-col gap-4 border-b border-[#173f35]/12 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">Audit trail</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">发布与撤回审计</h2><p className="mt-3 text-sm leading-6 text-[#607169]">本机记录用于验证字段与流程，不能替代生产环境不可篡改日志。</p></div><button type="button" onClick={exportData} disabled={!data.auditLogs.length} className={secondaryButtonClass}><DownloadSimple size={17} aria-hidden="true" />导出全部</button></div>
              <div className="mt-7">{data.auditLogs.length === 0 ? <EmptyState icon={<Archive size={23} />} title="暂无审计记录" description="创建、提交、审核、发布、撤回与纠错状态变化都会在这里留下记录。" /> : <ol className="divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">{data.auditLogs.map((log) => <li key={log.id} className="grid gap-2 py-5 md:grid-cols-[9rem_1fr_auto] md:items-start"><span className="text-xs text-[#75837d]">{formatDateTime(log.at)}</span><div><div className="flex flex-wrap items-center gap-2"><strong>{log.entityName}</strong><span className="rounded-full bg-[#173f35]/7 px-2 py-1 text-[10px] font-semibold">{log.action}</span></div><p className="mt-2 text-sm text-[#607169]">{log.actorName} · {log.actorRole}{log.note ? ` · ${log.note}` : ""}</p></div><span className="text-xs font-semibold text-[#6d624e]">{log.fromState ? `${log.fromState} → ` : ""}{log.toState}</span></li>)}</ol>}</div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-[#173f35]/10 px-4 py-7 text-xs text-[#697970] md:px-8"><div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span>六祖云游 · 运营治理本机原型</span><span>无数据库 · 无真实鉴权 · 无线上发布</span></div></footer>
    </main>
  );
}
