"use client";

import {
  ArrowClockwise,
  CheckCircle,
  ClockCountdown,
  FileMagnifyingGlass,
  LinkSimple,
  MapPin,
  ShieldWarning,
  SpinnerGap,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseGisDraftReviewQueuePage,
  parseGisDraftSubmissionDetail,
  parseGisDraftSubmissionReceipt,
  isGisDraftSubmissionId,
  type GisDraftReviewDecision,
  type GisDraftReviewQueueItem,
  type GisDraftSubmissionDetail,
  type GisDraftSubmissionReceipt,
} from "@/lib/gis-draft-review-contract";
import type { MapEditorDraft } from "@/lib/map-editor-draft";
import { GisDraftReviewMap } from "./GisDraftReviewMap";

const QUEUE_ENDPOINT = "/api/v1/admin/scenic-areas/liuzu-town/gis-draft-submissions";
const OBJECT_LABELS: Record<MapEditorDraft["objectType"], string> = {
  ENTRANCE: "入口 / 出口",
  PATH: "道路 / 步道",
  POI: "景点",
  FACILITY: "设施",
  RECOMMENDED_ROUTE: "推荐路线",
  BOUNDARY: "候选边界",
  NOTE: "空间备注",
};

type UnknownRecord = Record<string, unknown>;
type QueuePhase = "loading" | "ready" | "unavailable" | "error";
type DetailPhase = "idle" | "loading" | "ready" | "unavailable" | "error";
type ReviewPhase = "idle" | "submitting" | "success" | "error";

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validRequestId(value: unknown) {
  return isGisDraftSubmissionId(value);
}

function parseQueueEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "page"]) || value.schemaVersion !== 1 || !validRequestId(value.requestId)) return null;
  return parseGisDraftReviewQueuePage(value.page);
}

function parseDetailEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "detail"]) || value.schemaVersion !== 1 || !validRequestId(value.requestId)) return null;
  return parseGisDraftSubmissionDetail(value.detail);
}

function parseReviewEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "receipt"]) || value.schemaVersion !== 1 || !validRequestId(value.requestId)) return null;
  return parseGisDraftSubmissionReceipt(value.receipt);
}

function errorMessage(value: unknown, fallback: string) {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== "string" || value.error.message.length > 300) return fallback;
  return value.error.message;
}

function validHttpsEvidence(value: string) {
  if (!value || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间无效"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(date);
}

function newIdempotencyKey() {
  return `gis-review-${crypto.randomUUID()}`;
}

function receiptStateLabel(receipt: GisDraftSubmissionReceipt) {
  if (receipt.state === "APPROVED_FOR_FORMALIZATION") return "已通过专业审核 · 待正式化";
  if (receipt.state === "REJECTED") return "已退回";
  return "待专业审核";
}

function ObjectAttributes({ draft }: { draft: MapEditorDraft }) {
  if (draft.routingAttributes) {
    return (
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#5c6e66]">
        <div><dt className="font-semibold text-[#294b3e]">道路类型</dt><dd>{draft.routingAttributes.traversalMode}</dd></div>
        <div><dt className="font-semibold text-[#294b3e]">难度</dt><dd>{draft.routingAttributes.difficulty}</dd></div>
        <div><dt className="font-semibold text-[#294b3e]">观光评分</dt><dd>{draft.routingAttributes.scenicScore}</dd></div>
        <div><dt className="font-semibold text-[#294b3e]">无障碍</dt><dd>{draft.routingAttributes.accessibility}</dd></div>
        {draft.routingAttributes.transportService && <>
          <div className="col-span-2"><dt className="font-semibold text-[#294b3e]">交通服务</dt><dd>{draft.routingAttributes.transportService.serviceName}</dd></div>
          <div><dt className="font-semibold text-[#294b3e]">登乘 + 预计候乘</dt><dd>{draft.routingAttributes.transportService.boardingMinutes + draft.routingAttributes.transportService.expectedWaitMinutes} 分钟</dd></div>
          <div><dt className="font-semibold text-[#294b3e]">乘行</dt><dd>{draft.routingAttributes.transportService.inVehicleMinutes} 分钟</dd></div>
          <div className="col-span-2"><a href={draft.routingAttributes.transportService.scheduleEvidenceReference} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">查看班次/服务证据</a></div>
        </>}
      </dl>
    );
  }
  if (draft.visitAttributes) {
    return (
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#5c6e66]">
        <div><dt className="font-semibold text-[#294b3e]">建议停留</dt><dd>{draft.visitAttributes.dwellMinutes} 分钟</dd></div>
        <div><dt className="font-semibold text-[#294b3e]">编辑优先级</dt><dd>{draft.visitAttributes.editorialPriority}</dd></div>
        <div className="col-span-2"><dt className="font-semibold text-[#294b3e]">兴趣标签</dt><dd>{draft.visitAttributes.interests.join(" · ")}</dd></div>
      </dl>
    );
  }
  return null;
}

export function GisDraftReviewWorkbench() {
  const [queuePhase, setQueuePhase] = useState<QueuePhase>("loading");
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [items, setItems] = useState<GisDraftReviewQueueItem[]>([]);
  const [nextBeforeRevision, setNextBeforeRevision] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailPhase, setDetailPhase] = useState<DetailPhase>("idle");
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<GisDraftSubmissionDetail | null>(null);
  const [evidenceReference, setEvidenceReference] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>("idle");
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const queueRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const reviewAttemptRef = useRef<{ payload: string; key: string } | null>(null);

  const loadQueue = useCallback(async (append: boolean, beforeRevision: number | null) => {
    const requestNumber = ++queueRequestRef.current;
    setQueuePhase("loading");
    setQueueNotice(null);
    const query = new URLSearchParams({ limit: "25" });
    if (beforeRevision !== null) query.set("beforeRevision", String(beforeRevision));
    try {
      const response = await fetch(`${QUEUE_ENDPOINT}?${query}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (queueRequestRef.current !== requestNumber) return;
      if (!response.ok) {
        setQueuePhase(response.status === 503 ? "unavailable" : "error");
        setQueueNotice(errorMessage(payload, "GIS 待审队列暂不可用。"));
        return;
      }
      const page = parseQueueEnvelope(payload);
      if (!page) {
        setQueuePhase("error");
        setQueueNotice("待审队列响应没有通过严格校验，未显示任何候选数据。");
        return;
      }
      setItems((current) => {
        const combined = append ? [...current, ...page.items] : page.items;
        return combined.filter((item, index) => combined.findIndex((candidate) => candidate.receipt.submissionId === item.receipt.submissionId) === index);
      });
      setNextBeforeRevision(page.nextBeforeRevision);
      setQueuePhase("ready");
    } catch {
      if (queueRequestRef.current !== requestNumber) return;
      setQueuePhase("error");
      setQueueNotice("无法连接 GIS 审核服务；没有读取或修改候选数据。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueue(false, null), 0);
    return () => {
      window.clearTimeout(timer);
      queueRequestRef.current += 1;
      detailRequestRef.current += 1;
    };
  }, [loadQueue]);

  async function openSubmission(submissionId: string) {
    const requestNumber = ++detailRequestRef.current;
    setSelectedId(submissionId);
    setDetail(null);
    setDetailPhase("loading");
    setDetailNotice(null);
    setEvidenceReference("");
    setAcknowledged(false);
    setReviewPhase("idle");
    setReviewNotice(null);
    reviewAttemptRef.current = null;
    try {
      const response = await fetch(`${QUEUE_ENDPOINT}/${encodeURIComponent(submissionId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (detailRequestRef.current !== requestNumber) return;
      if (!response.ok) {
        setDetailPhase(response.status === 503 ? "unavailable" : "error");
        setDetailNotice(errorMessage(payload, "GIS 候选详情暂不可用。"));
        return;
      }
      const parsed = parseDetailEnvelope(payload);
      if (!parsed || parsed.receipt.submissionId !== submissionId) {
        setDetailPhase("error");
        setDetailNotice("候选详情响应没有通过身份、数量或结构校验。");
        return;
      }
      setDetail(parsed);
      setDetailPhase("ready");
    } catch {
      if (detailRequestRef.current !== requestNumber) return;
      setDetailPhase("error");
      setDetailNotice("无法连接 GIS 候选详情服务；审核操作保持关闭。");
    }
  }

  async function submitDecision(decision: GisDraftReviewDecision) {
    if (!detail || reviewPhase === "submitting") return;
    if (detail.receipt.state !== "SUBMITTED" || detail.receipt.workflowRevision !== 1) {
      setReviewPhase("error");
      setReviewNotice("该候选版本已不是可审核状态，请刷新队列。");
      return;
    }
    if (detail.reviewEligibility !== "ELIGIBLE") {
      setReviewPhase("error");
      setReviewNotice("提交人与审核人必须分离；当前身份不能处理这份提交。");
      return;
    }
    if (!validHttpsEvidence(evidenceReference) || !acknowledged) {
      setReviewPhase("error");
      setReviewNotice("请填写不含账号口令的 HTTPS 审核证据链接，并确认专业核对声明。");
      return;
    }
    const body = {
      schemaVersion: 1,
      expectedWorkflowRevision: 1,
      decision,
      evidenceReference: evidenceReference.trim(),
    } as const;
    const payload = JSON.stringify(body);
    const existingAttempt = reviewAttemptRef.current;
    const key = existingAttempt?.payload === payload ? existingAttempt.key : newIdempotencyKey();
    reviewAttemptRef.current = { payload, key };
    setReviewPhase("submitting");
    setReviewNotice(null);
    try {
      const response = await fetch(`${QUEUE_ENDPOINT}/${encodeURIComponent(detail.receipt.submissionId)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json", "idempotency-key": key },
        body: payload,
      });
      const responsePayload = await response.json().catch(() => null) as unknown;
      if (reviewAttemptRef.current?.payload !== payload) return;
      if (!response.ok) {
        setReviewPhase("error");
        setReviewNotice(errorMessage(responsePayload, "审核决定未保存，候选版本保持不变。"));
        return;
      }
      const receipt = parseReviewEnvelope(responsePayload);
      if (!receipt || receipt.submissionId !== detail.receipt.submissionId || receipt.workflowRevision !== 2) {
        setReviewPhase("error");
        setReviewNotice("审核回执没有通过严格校验，界面不会把该版本标记为已处理。");
        return;
      }
      setDetail((current) => current ? { ...current, receipt } : current);
      setItems((current) => current.filter((item) => item.receipt.submissionId !== receipt.submissionId));
      setReviewPhase("success");
      setReviewNotice(receipt.state === "APPROVED_FOR_FORMALIZATION"
        ? "专业审核已记录；该版本只进入待正式化状态，尚未发布到游客路网。"
        : "退回决定已记录；候选对象保持在不可变隔离区。",
      );
    } catch {
      if (reviewAttemptRef.current?.payload !== payload) return;
      setReviewPhase("error");
      setReviewNotice("无法连接审核服务；决定未确认保存，可使用同一内容安全重试。");
    }
  }

  return (
    <div className="mx-auto max-w-[1580px] px-4 pb-24 pt-5 text-[#173f35] sm:px-6 lg:px-8">
      <section className="rounded-[1.5rem] border border-[#b88a43]/22 bg-[#f4eadb] p-4 text-sm leading-6 text-[#6b5735]" role="status">
        <strong className="flex items-center gap-2 text-[#755a2c]"><ShieldWarning size={20} weight="fill" />GIS 专业审核隔离区</strong>
        <p className="mt-1">这里只处理服务器中的不可变候选版本。批准仅表示可进入后续正式化；不会生成正式路网、开放状态或游客导航。</p>
      </section>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-[1.7rem] border border-[#173f35]/12 bg-white/65 p-4 shadow-[0_18px_50px_rgba(44,69,58,.08)]">
          <div className="flex items-center justify-between gap-3">
            <div><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#9b7a42]">Review queue</span><h2 className="mt-1 text-lg font-semibold">待审版本 · {items.length}</h2></div>
            <button type="button" onClick={() => void loadQueue(false, null)} disabled={queuePhase === "loading"} className="grid h-11 w-11 place-items-center rounded-full border border-[#173f35]/14 disabled:opacity-40" aria-label="刷新 GIS 待审队列"><ArrowClockwise size={18} className={queuePhase === "loading" ? "animate-spin" : ""} /></button>
          </div>

          {queuePhase === "loading" && items.length === 0 && <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#edf0ed] p-4 text-xs" role="status"><SpinnerGap size={17} className="animate-spin" />正在读取隔离审核队列…</p>}
          {queueNotice && <p className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${queuePhase === "unavailable" ? "border-[#b88a43]/20 bg-[#f4eadb]" : "border-[#a85749]/20 bg-[#f8e8e3] text-[#714a43]"}`} role="alert">{queueNotice}</p>}
          {queuePhase === "ready" && items.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-[#173f35]/18 p-5 text-center text-xs leading-5 text-[#64736c]"><CheckCircle size={25} className="mx-auto mb-2 text-[#3e735f]" />当前没有待审候选版本。</div>}

          <div className="mt-4 grid gap-2">
            {items.map((item) => {
              const receipt = item.receipt;
              return (
                <button key={receipt.submissionId} type="button" onClick={() => void openSubmission(receipt.submissionId)} aria-pressed={selectedId === receipt.submissionId} className={`rounded-xl border p-3 text-left transition-colors ${selectedId === receipt.submissionId ? "border-[#173f35] bg-[#e7eee8]" : "border-[#173f35]/10 bg-[#fffdf8] hover:border-[#173f35]/25"}`}>
                  <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span>候选版本 #{receipt.submissionRevision}</span><span>{receipt.objectCount} 项</span></span>
                  <span className="mt-2 block text-[11px] text-[#64736c]">{formatDateTime(receipt.submittedAt)}</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-[#7b8983]">SHA-256 {receipt.contentSha256.slice(0, 16)}…</span>
                  {item.reviewEligibility !== "ELIGIBLE" && <span className="mt-2 block rounded-lg bg-[#f8e8e3] px-2 py-1 text-[10px] font-semibold text-[#84463d]">当前身份是提交人，不能自审</span>}
                </button>
              );
            })}
          </div>
          {nextBeforeRevision !== null && <button type="button" onClick={() => void loadQueue(true, nextBeforeRevision)} disabled={queuePhase === "loading"} className="mt-4 min-h-11 w-full rounded-full border border-[#173f35]/14 text-xs font-semibold disabled:opacity-40">加载更早版本</button>}
        </aside>

        <main className="min-w-0 rounded-[1.8rem] border border-[#173f35]/12 bg-white/62 p-4 shadow-[0_20px_60px_rgba(44,69,58,.08)] sm:p-5">
          {detailPhase === "idle" && <div className="grid min-h-[540px] place-items-center text-center"><div><FileMagnifyingGlass size={42} className="mx-auto text-[#9b7a42]" /><h2 className="mt-4 text-xl font-semibold">选择一个待审版本</h2><p className="mt-2 text-sm text-[#64736c]">详情会从隔离真库读取，不使用编辑器本机草稿。</p></div></div>}
          {detailPhase === "loading" && <div className="grid min-h-[540px] place-items-center" role="status"><span className="flex items-center gap-2 text-sm font-semibold"><SpinnerGap size={20} className="animate-spin" />正在核对候选版本与内容哈希…</span></div>}
          {(detailPhase === "error" || detailPhase === "unavailable") && <div className="grid min-h-[540px] place-items-center text-center" role="alert"><div className="max-w-md"><XCircle size={42} className="mx-auto text-[#a85749]" /><h2 className="mt-4 text-xl font-semibold">候选详情未开放</h2><p className="mt-2 text-sm leading-6 text-[#64736c]">{detailNotice}</p></div></div>}

          {detailPhase === "ready" && detail && <div>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#173f35]/10 pb-4">
              <div><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#9b7a42]">Submission #{detail.receipt.submissionRevision}</span><h2 className="mt-1 text-2xl font-semibold">{receiptStateLabel(detail.receipt)}</h2><p className="mt-2 text-xs text-[#64736c]">提交于 {formatDateTime(detail.receipt.submittedAt)} · workflow revision {detail.receipt.workflowRevision}</p></div>
              <span className="rounded-full border border-[#173f35]/12 bg-[#edf0ed] px-3 py-1.5 text-xs font-semibold">{detail.receipt.objectCount} 个不可变对象</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
              <GisDraftReviewMap collection={detail.collection} />
              <section className="rounded-[1.5rem] border border-[#173f35]/10 bg-[#fffdf8] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ClockCountdown size={18} />版本证据</h3>
                <dl className="mt-4 grid gap-3 text-xs">
                  <div><dt className="font-semibold">内容 SHA-256</dt><dd className="mt-1 break-all font-mono text-[10px] text-[#64736c]">{detail.receipt.contentSha256}</dd></div>
                  <div><dt className="font-semibold">景区租户</dt><dd className="mt-1 text-[#64736c]">{detail.receipt.scenicAreaId}</dd></div>
                  <div><dt className="font-semibold">职责分离</dt><dd className={`mt-1 ${detail.reviewEligibility === "ELIGIBLE" ? "text-[#3e735f]" : "text-[#a85749]"}`}>{detail.reviewEligibility === "ELIGIBLE" ? "当前审核身份与提交人不同" : "当前身份与提交人相同，审核被禁止"}</dd></div>
                </dl>
              </section>
            </div>

            <section className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin size={18} />候选对象与来源</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {detail.collection.drafts.map((draft) => <article key={draft.id} className="rounded-[1.3rem] border border-[#173f35]/10 bg-[#fffdf8] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#9b7a42]">{OBJECT_LABELS[draft.objectType]}</span><h4 className="mt-1 font-semibold">{draft.title}</h4></div><span className="rounded-full bg-[#edf0ed] px-2 py-1 text-[10px]">{draft.geometry.type}</span></div>
                  <p className="mt-3 text-xs leading-5 text-[#5c6e66]"><strong>来源：</strong>{draft.source.label}<br /><strong>采集：</strong>{formatDateTime(draft.source.capturedAt)}</p>
                  {draft.source.url && <a href={draft.source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#315c9a]"><LinkSimple size={14} />打开来源证据</a>}
                  <ObjectAttributes draft={draft} />
                  {draft.notes && <p className="mt-3 rounded-lg bg-[#edf0ed] p-2 text-[11px] leading-5 text-[#5c6e66]">{draft.notes}</p>}
                </article>)}
              </div>
            </section>

            {reviewNotice && <p className={`mt-5 rounded-xl border p-3 text-xs leading-5 ${reviewPhase === "success" ? "border-[#3e735f]/20 bg-[#e7eee8] text-[#315944]" : "border-[#a85749]/20 bg-[#f8e8e3] text-[#714a43]"}`} role="status">{reviewNotice}</p>}

            {detail.receipt.state === "SUBMITTED" && <section className="mt-5 rounded-[1.5rem] border border-[#b88a43]/22 bg-[#f4eadb] p-4">
              <h3 className="text-sm font-semibold">记录专业审核决定</h3>
              <p className="mt-1 text-xs leading-5 text-[#6b5735]">请先在专业 GIS 工具和现场/来源资料中核对。证据链接不得包含账号口令、访问令牌或个人精确位置。</p>
              <label className="mt-4 grid gap-1.5 text-xs font-semibold">HTTPS 审核证据链接<input type="url" value={evidenceReference} onChange={(event) => { setEvidenceReference(event.target.value); reviewAttemptRef.current = null; setReviewPhase("idle"); setReviewNotice(null); }} maxLength={500} placeholder="https://…" className="min-h-11 rounded-xl border border-[#173f35]/15 bg-white px-3 text-sm font-normal outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b88a43]" /></label>
              <label className="mt-3 flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /><span>我已核对对象类型、WGS84 几何、来源、许可/权利、道路属性与职责分离，并理解“通过”不等于正式发布或现场安全验收。</span></label>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => void submitDecision("REJECT")} disabled={reviewPhase === "submitting" || detail.reviewEligibility !== "ELIGIBLE"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#a85749]/30 bg-white px-4 text-sm font-semibold text-[#84463d] disabled:opacity-40"><XCircle size={18} />退回候选版本</button>
                <button type="button" onClick={() => void submitDecision("APPROVE_FOR_FORMALIZATION")} disabled={reviewPhase === "submitting" || detail.reviewEligibility !== "ELIGIBLE"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#315944] px-4 text-sm font-semibold text-white disabled:opacity-40">{reviewPhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <CheckCircle size={18} />}通过并进入待正式化</button>
              </div>
            </section>}

            {detail.receipt.state !== "SUBMITTED" && <section className="mt-5 rounded-[1.5rem] border border-[#173f35]/10 bg-[#edf0ed] p-4 text-sm leading-6"><strong>{receiptStateLabel(detail.receipt)}</strong><p className="mt-1 text-xs text-[#64736c]">审核时间：{detail.receipt.reviewedAt ? formatDateTime(detail.receipt.reviewedAt) : "未知"}</p>{detail.receipt.reviewEvidenceReference && <a href={detail.receipt.reviewEvidenceReference} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#315c9a]"><LinkSimple size={14} />查看审核证据</a>}</section>}
          </div>}
        </main>
      </div>
    </div>
  );
}
