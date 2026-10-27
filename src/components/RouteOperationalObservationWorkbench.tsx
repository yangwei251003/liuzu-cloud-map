"use client";

import {
  ArrowClockwise,
  CheckCircle,
  CloudSun,
  LinkSimple,
  SpinnerGap,
  UsersThree,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseRouteOperationalObservationOverview,
  parseRouteOperationalObservationReceipt,
  type RouteCrowdLevel,
  type RouteOperationalObservationDecision,
  type RouteOperationalObservationOverview,
  type RouteWeatherImpact,
} from "@/lib/route-operational-observation-contract";

const ENDPOINT = "/api/v1/admin/scenic-areas/liuzu-town/route-operational-observations";
const fieldClass = "w-full rounded-xl border border-[#173f35]/15 bg-white px-3.5 py-3 text-sm text-[#173f35] outline-none focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

const crowdLabels: Record<RouteCrowdLevel, string> = { LOW: "低", MODERATE: "中等", HIGH: "高" };
const weatherLabels: Record<RouteWeatherImpact, string> = { NONE: "无", RAIN: "降雨", HEAT: "高温", WIND: "大风", MULTIPLE: "多重影响" };
const stateLabels = { PENDING_REVIEW: "待独立复核", CONFIRMED: "已确认", REJECTED: "已拒绝", EXPIRED: "已到期" } as const;

type UnknownRecord = Record<string, unknown>;
type Phase = "loading" | "ready" | "unavailable" | "error";
type WritePhase = "idle" | "submitting" | "success" | "error";

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: UnknownRecord, expected: string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseOverviewEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "overview"]) || value.schemaVersion !== 1 || !isUuid(value.requestId)) return null;
  return parseRouteOperationalObservationOverview(value.overview);
}

function parseReceiptEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "receipt"]) || value.schemaVersion !== 1 || !isUuid(value.requestId)) return null;
  return parseRouteOperationalObservationReceipt(value.receipt);
}

function errorMessage(value: unknown, fallback: string) {
  return isRecord(value) && isRecord(value.error) && typeof value.error.message === "string" && value.error.message.length <= 300 ? value.error.message : fallback;
}

function isHttps(value: string) {
  try {
    const url = new URL(value);
    return value.length <= 500 && url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function toLocalInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function inputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间无效" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(date);
}

export function RouteOperationalObservationWorkbench() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<RouteOperationalObservationOverview | null>(null);
  const [edgeId, setEdgeId] = useState("");
  const [crowdLevel, setCrowdLevel] = useState<RouteCrowdLevel>("MODERATE");
  const [weatherImpact, setWeatherImpact] = useState<RouteWeatherImpact>("NONE");
  const [multiplier, setMultiplier] = useState("1.25");
  const [operatorNote, setOperatorNote] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitAcknowledged, setSubmitAcknowledged] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<WritePhase>("idle");
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [reviewEvidence, setReviewEvidence] = useState("");
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<WritePhase>("idle");
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const submitAttempt = useRef<{ payload: string; key: string } | null>(null);
  const reviewAttempt = useRef<{ observationId: string; payload: string; key: string } | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setPhase("loading");
    setNotice(null);
    try {
      const response = await fetch(ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const body = await response.json().catch(() => null) as unknown;
      if (sequence !== loadSequence.current) return;
      if (!response.ok) {
        setPhase(response.status === 503 ? "unavailable" : "error");
        setNotice(errorMessage(body, "动态运营观测服务暂不可用。"));
        setOverview(null);
        return;
      }
      const parsed = parseOverviewEnvelope(body);
      if (!parsed) {
        setPhase("error");
        setNotice("观测响应未通过严格结构校验，页面没有采用其中的路段或工作流状态。");
        setOverview(null);
        return;
      }
      setOverview(parsed);
      const openEdge = parsed.edges.find((edge) => edge.operationalStatus === "OPEN");
      setEdgeId((current) => parsed.edges.some((edge) => edge.id === current && edge.operationalStatus === "OPEN") ? current : openEdge?.id ?? "");
      setSelectedObservationId((current) => parsed.observations.some((item) => item.id === current && item.effectiveState === "PENDING_REVIEW") ? current : null);
      setPhase("ready");
    } catch {
      if (sequence !== loadSequence.current) return;
      setPhase("error");
      setNotice("无法连接动态运营观测服务；没有读取或修改正式路网。");
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setObservedAt(toLocalInput(now));
      setExpiresAt(toLocalInput(new Date(now.getTime() + 2 * 60 * 60 * 1000)));
      void load();
    }, 0);
    return () => { window.clearTimeout(timer); loadSequence.current += 1; };
  }, [load]);

  async function submitObservation() {
    if (!overview?.snapshot || overview.actorRole !== "OPERATIONS_EDITOR" || submitPhase === "submitting") return;
    const observedIso = inputToIso(observedAt);
    const expiresIso = inputToIso(expiresAt);
    const parsedMultiplier = Number(multiplier);
    if (
      !edgeId || !Number.isFinite(parsedMultiplier) || parsedMultiplier < 1 || parsedMultiplier > 3
      || (parsedMultiplier === 1 && (crowdLevel !== "LOW" || weatherImpact !== "NONE"))
      || operatorNote.trim() !== operatorNote || operatorNote.length < 10 || !isHttps(sourceReference)
      || !observedIso || !expiresIso || !submitAcknowledged
    ) {
      setSubmitPhase("error");
      setSubmitNotice("请完整填写路段、客流、天气、1–3 倍耗时、至少 10 字说明、HTTPS 一手依据和六小时内有效时间，并完成确认。");
      return;
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      edgeId,
      crowdLevel,
      weatherImpact,
      travelTimeMultiplier: parsedMultiplier,
      operatorNote,
      sourceReference,
      observedAt: observedIso,
      expiresAt: expiresIso,
      expectedSnapshotRevision: overview.snapshot.snapshotRevision,
      acknowledgeSourceBackedObservation: true,
    });
    const attempt = submitAttempt.current?.payload === payload ? submitAttempt.current : { payload, key: `route-factor-${crypto.randomUUID()}` };
    submitAttempt.current = attempt;
    setSubmitPhase("submitting");
    setSubmitNotice(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setSubmitPhase("error");
        setSubmitNotice(errorMessage(body, "动态运营观测未写入。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.edgeId !== edgeId || receipt.workflowRevision !== 1) {
        setSubmitPhase("error");
        setSubmitNotice("观测回执未通过版本或结构校验；没有假定写入成功。");
        return;
      }
      submitAttempt.current = null;
      setSubmitPhase("success");
      setSubmitNotice("观测已进入独立复核队列；尚未改变游客路线。");
      setOperatorNote("");
      setSourceReference("");
      setSubmitAcknowledged(false);
      await load();
    } catch {
      setSubmitPhase("error");
      setSubmitNotice("网络中断，无法确认写入结果；保持相同内容重试可复用幂等键。");
    }
  }

  async function reviewObservation(decision: RouteOperationalObservationDecision) {
    const observation = overview?.observations.find((item) => item.id === selectedObservationId);
    if (!observation || observation.effectiveState !== "PENDING_REVIEW" || overview?.actorRole !== "OPERATIONS_REVIEWER" || reviewPhase === "submitting") return;
    if (!isHttps(reviewEvidence) || !reviewAcknowledged) {
      setReviewPhase("error");
      setReviewNotice("请填写独立复核 HTTPS 证据并确认职责分离与现场一致性。");
      return;
    }
    const payload = JSON.stringify({ schemaVersion: 1, decision, expectedWorkflowRevision: 1, reviewEvidenceReference: reviewEvidence, acknowledgeIndependentReview: true });
    const attempt = reviewAttempt.current?.observationId === observation.id && reviewAttempt.current.payload === payload
      ? reviewAttempt.current
      : { observationId: observation.id, payload, key: `route-factor-review-${crypto.randomUUID()}` };
    reviewAttempt.current = attempt;
    setReviewPhase("submitting");
    setReviewNotice(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(observation.id)}/review`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setReviewPhase("error");
        setReviewNotice(errorMessage(body, "动态运营观测未完成复核。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.id !== observation.id || receipt.workflowRevision !== 2 || receipt.reviewDecision !== decision) {
        setReviewPhase("error");
        setReviewNotice("复核回执未通过严格校验；没有假定工作流已完成。");
        return;
      }
      reviewAttempt.current = null;
      setReviewPhase("success");
      setReviewNotice(decision === "CONFIRMED" ? "观测已确认；仍须编译并独立发布完整快照后才影响游客路线。" : "观测已拒绝，不会进入快照候选。");
      setReviewEvidence("");
      setReviewAcknowledged(false);
      setSelectedObservationId(null);
      await load();
    } catch {
      setReviewPhase("error");
      setReviewNotice("网络中断，无法确认复核结果；保持相同内容重试可复用幂等键。");
    }
  }

  const selectedEdge = overview?.edges.find((edge) => edge.id === edgeId) ?? null;
  const pendingObservations = overview?.observations.filter((item) => item.effectiveState === "PENDING_REVIEW") ?? [];

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
      <div className="rounded-[1.8rem] border border-[#173f35]/10 bg-white/75 p-5 text-[#173f35] shadow-[0_22px_65px_rgba(23,63,53,.08)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#9a7339]">Dynamic operations</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">客流与天气动态观测</h2><p className="mt-3 max-w-[82ch] text-sm leading-6 text-[#687871]">短时观测必须绑定当前正式路段、HTTPS 依据与有效期，经过另一身份复核后，再由下方完整快照发布流程一次性生效。提交或复核本身不会改变游客路线。</p></div>
          <button type="button" onClick={() => void load()} disabled={phase === "loading"} className={`${buttonClass} border border-[#173f35]/14 bg-white text-[#173f35]`}><ArrowClockwise size={17} className={phase === "loading" ? "animate-spin" : ""} />刷新观测</button>
        </div>
        {notice ? <div className="mt-5 rounded-2xl border border-[#a85749]/20 bg-[#f7e4df] px-4 py-3 text-sm leading-6 text-[#8c4339]"><Warning size={18} className="mr-2 inline" />{notice}</div> : null}
        {overview ? <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl bg-[#f1f6f3] p-4"><dt className="text-[11px] text-[#687871]">当前职责</dt><dd className="mt-1 text-sm font-semibold">{overview.actorRole === "OPERATIONS_EDITOR" ? "观测提交" : "独立复核"}</dd></div><div className="rounded-2xl bg-[#f1f6f3] p-4"><dt className="text-[11px] text-[#687871]">正式版本</dt><dd className="mt-1 text-sm font-semibold">{overview.snapshot ? `r${overview.snapshot.snapshotRevision} / v${overview.snapshot.operationalVersion}` : "无可用快照"}</dd></div><div className="rounded-2xl bg-[#f1f6f3] p-4"><dt className="text-[11px] text-[#687871]">可观测开放路段</dt><dd className="mt-1 text-sm font-semibold">{overview.edges.filter((edge) => edge.operationalStatus === "OPEN").length}</dd></div><div className="rounded-2xl bg-[#f1f6f3] p-4"><dt className="text-[11px] text-[#687871]">待独立复核</dt><dd className="mt-1 text-sm font-semibold">{pendingObservations.length}</dd></div></dl> : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-[1.8rem] border border-[#173f35]/10 bg-white/80 p-5 text-[#173f35] sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#e6efe9]"><UsersThree size={22} /></span><div><h3 className="text-xl font-semibold">1. 提交短时观测</h3><p className="text-xs text-[#687871]">仅运营编辑；同一路段同时只允许一项待复核观测。</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">正式开放路段</span><select className={fieldClass} value={edgeId} onChange={(event) => { setEdgeId(event.target.value); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"}>{overview?.edges.filter((edge) => edge.operationalStatus === "OPEN").map((edge) => <option key={edge.id} value={edge.id}>{edge.edgeCode} · {edge.fromNodeCode} → {edge.toNodeCode} · {Math.round(edge.distanceMeters)}m</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">客流等级</span><select className={fieldClass} value={crowdLevel} onChange={(event) => { setCrowdLevel(event.target.value as RouteCrowdLevel); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"}>{Object.entries(crowdLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">天气影响</span><select className={fieldClass} value={weatherImpact} onChange={(event) => { setWeatherImpact(event.target.value as RouteWeatherImpact); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"}>{Object.entries(weatherLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">预计耗时倍率（1–3）</span><input className={fieldClass} type="number" min="1" max="3" step="0.05" value={multiplier} onChange={(event) => { setMultiplier(event.target.value); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /></label>
            <div className="rounded-xl border border-[#173f35]/10 bg-[#f1f6f3] px-4 py-3 text-xs leading-5 text-[#687871]"><strong className="text-[#173f35]">当前已发布值</strong><br />{selectedEdge ? `×${selectedEdge.currentTravelTimeMultiplier ?? "未知"} · 客流 ${selectedEdge.currentCrowdLevel ?? "未知"} · 天气 ${selectedEdge.currentWeatherImpact ?? "未知"}` : "请选择路段"}</div>
            <label><span className="mb-1.5 block text-xs font-semibold">观测时间</span><input className={fieldClass} type="datetime-local" value={observedAt} onChange={(event) => { setObservedAt(event.target.value); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold">失效时间（最长 6 小时）</span><input className={fieldClass} type="datetime-local" value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); submitAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">现场说明（10–1000 字）</span><textarea className={`${fieldClass} min-h-24 resize-y`} maxLength={1000} value={operatorNote} onChange={(event) => { setOperatorNote(event.target.value); submitAttempt.current = null; }} placeholder="只记录已观测事实、采集位置和方法，不写推测。" disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">一手依据 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input className={`${fieldClass} pl-9`} type="url" value={sourceReference} onChange={(event) => { setSourceReference(event.target.value); submitAttempt.current = null; }} placeholder="https://…" disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /></div></label>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#173f35]/12 bg-[#f1f6f3] p-4 text-sm leading-6"><input className="mt-1 h-4 w-4 accent-[#173f35]" type="checkbox" checked={submitAcknowledged} onChange={(event) => setSubmitAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "OPERATIONS_EDITOR"} /><span>我确认该值来自所附依据与现场观测，适用于所选正式路段和时间窗口；它必须先经独立复核和完整快照发布。</span></label>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className={`${buttonClass} bg-[#173f35] text-white`} onClick={() => void submitObservation()} disabled={overview?.actorRole !== "OPERATIONS_EDITOR" || !overview?.snapshot || submitPhase === "submitting"}>{submitPhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <CloudSun size={18} />}提交观测</button>{submitNotice ? <p className={`text-sm ${submitPhase === "success" ? "text-[#2f7d62]" : "text-[#a85749]"}`}>{submitNotice}</p> : null}</div>
        </article>

        <article className="rounded-[1.8rem] border border-[#b88a43]/18 bg-[#fffaf2] p-5 text-[#173f35] sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f4e8cf] text-[#8a6b32]"><CheckCircle size={22} /></span><div><h3 className="text-xl font-semibold">2. 独立复核</h3><p className="text-xs text-[#687871]">复核人与提交人必须是不同可信身份。</p></div></div>
          <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {pendingObservations.length ? pendingObservations.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedObservationId(item.id); reviewAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_REVIEWER"} className={`w-full rounded-2xl border p-4 text-left text-sm leading-6 transition ${selectedObservationId === item.id ? "border-[#b88a43] bg-[#fff7e8]" : "border-[#173f35]/10 bg-white hover:border-[#b88a43]/45"}`}><span className="font-semibold">{item.edgeCode} · 客流{crowdLabels[item.crowdLevel]} · {weatherLabels[item.weatherImpact]} · ×{item.travelTimeMultiplier}</span><span className="mt-1 block text-xs text-[#687871]">{item.operatorNote}</span><span className="mt-2 block text-[11px] text-[#8a7550]">{stateLabels[item.effectiveState]} · 至 {formatDateTime(item.expiresAt)}</span></button>) : <div className="rounded-2xl border border-dashed border-[#b88a43]/30 p-5 text-sm text-[#687871]">当前没有待独立复核的动态观测。</div>}
          </div>
          <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold">独立复核证据 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input className={`${fieldClass} pl-9`} type="url" value={reviewEvidence} onChange={(event) => { setReviewEvidence(event.target.value); reviewAttempt.current = null; }} placeholder="https://…" disabled={overview?.actorRole !== "OPERATIONS_REVIEWER" || !selectedObservationId} /></div></label>
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#b88a43]/18 bg-white p-4 text-sm leading-6"><input className="mt-1 h-4 w-4 accent-[#8a6b32]" type="checkbox" checked={reviewAcknowledged} onChange={(event) => setReviewAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "OPERATIONS_REVIEWER" || !selectedObservationId} /><span>我已独立核对路段、采集时间、现场说明、倍率和证据，且不是该观测的提交人。</span></label>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={`${buttonClass} bg-[#2f7d62] text-white`} onClick={() => void reviewObservation("CONFIRMED")} disabled={overview?.actorRole !== "OPERATIONS_REVIEWER" || !selectedObservationId || reviewPhase === "submitting"}>{reviewPhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <CheckCircle size={18} />}确认观测</button><button type="button" className={`${buttonClass} border border-[#a85749]/25 bg-white text-[#a85749]`} onClick={() => void reviewObservation("REJECTED")} disabled={overview?.actorRole !== "OPERATIONS_REVIEWER" || !selectedObservationId || reviewPhase === "submitting"}><XCircle size={18} />拒绝观测</button></div>
          {reviewNotice ? <p className={`mt-3 text-sm ${reviewPhase === "success" ? "text-[#2f7d62]" : "text-[#a85749]"}`}>{reviewNotice}</p> : null}
        </article>
      </div>
    </section>
  );
}
