"use client";

import {
  ArrowClockwise,
  CheckCircle,
  ClockCountdown,
  LinkSimple,
  ShieldWarning,
  SpinnerGap,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROUTE_CLOSURE_INCIDENT_TYPES,
  parseRouteClosureReceipt,
  parseRouteOperationsOverview,
  type RouteClosureIncidentType,
  type RouteClosureReviewDecision,
  type RouteClosureStatus,
  type RouteOperationsOverview,
} from "@/lib/route-operations-contract";

const ENDPOINT = "/api/v1/admin/scenic-areas/liuzu-town/route-operations";
const fieldClass = "w-full rounded-xl border border-[#173f35]/15 bg-white px-3.5 py-3 text-sm text-[#173f35] outline-none focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

const incidentLabels: Record<RouteClosureIncidentType, string> = {
  WEATHER: "天气影响",
  DAMAGE: "道路或设施损坏",
  CROWD_CONTROL: "客流管制",
  MAINTENANCE: "维护施工",
  EVENT_CONTROL: "活动管制",
  SAFETY_OBSERVATION: "现场安全观察",
  OTHER: "其他已核实原因",
};

const stateLabels = {
  SCHEDULED: "待生效",
  ACTIVE_PENDING_REVIEW: "已生效 · 待独立复核",
  ACTIVE_CONFIRMED: "已生效 · 已确认",
  WITHDRAWN: "事件已撤回",
  EXPIRED: "已到期",
} as const;

type UnknownRecord = Record<string, unknown>;
type Phase = "loading" | "ready" | "unavailable" | "error";
type WritePhase = "idle" | "submitting" | "success" | "error";

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

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
  return parseRouteOperationsOverview(value.overview);
}

function parseReceiptEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "receipt"]) || value.schemaVersion !== 1 || !isUuid(value.requestId)) return null;
  return parseRouteClosureReceipt(value.receipt);
}

function errorMessage(value: unknown, fallback: string) {
  return isRecord(value) && isRecord(value.error) && typeof value.error.message === "string" && value.error.message.length <= 300
    ? value.error.message
    : fallback;
}

function isHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && value.length <= 500;
  } catch {
    return false;
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间无效" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(date);
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function RouteOperationsWorkbench() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<RouteOperationsOverview | null>(null);
  const [edgeId, setEdgeId] = useState("");
  const [status, setStatus] = useState<RouteClosureStatus>("CLOSED");
  const [incidentType, setIncidentType] = useState<RouteClosureIncidentType>("SAFETY_OBSERVATION");
  const [operatorNote, setOperatorNote] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [reasonEvidenceReference, setReasonEvidenceReference] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [activationAcknowledged, setActivationAcknowledged] = useState(false);
  const [activationPhase, setActivationPhase] = useState<WritePhase>("idle");
  const [activationNotice, setActivationNotice] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reviewEvidence, setReviewEvidence] = useState("");
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<WritePhase>("idle");
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const activationAttempt = useRef<{ payload: string; key: string } | null>(null);
  const reviewAttempt = useRef<{ eventId: string; payload: string; key: string } | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setPhase("loading");
    setNotice(null);
    try {
      const response = await fetch(ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as unknown;
      if (sequence !== loadSequence.current) return;
      if (!response.ok) {
        setPhase(response.status === 503 ? "unavailable" : "error");
        setNotice(errorMessage(payload, "道路运营服务暂不可用。"));
        setOverview(null);
        return;
      }
      const parsed = parseOverviewEnvelope(payload);
      if (!parsed) {
        setPhase("error");
        setNotice("运营响应未通过严格结构校验，页面没有采用其中的路段或管制状态。");
        setOverview(null);
        return;
      }
      setOverview(parsed);
      const firstOpenEdge = parsed.edges.find((edge) => edge.safetyState === "OPEN" && edge.operationalStatus === "OPEN");
      setEdgeId((current) => parsed.edges.some((edge) => edge.id === current) ? current : firstOpenEdge?.id ?? "");
      setPhase("ready");
    } catch {
      if (sequence !== loadSequence.current) return;
      setPhase("error");
      setNotice("无法连接道路运营服务；没有读取或修改正式路网。");
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setStartsAt(toLocalInput(now));
      setExpiresAt(toLocalInput(new Date(now.getTime() + 2 * 60 * 60 * 1000)));
      void load();
    }, 0);
    return () => { window.clearTimeout(timer); loadSequence.current += 1; };
  }, [load]);

  async function activateClosure() {
    if (!overview?.snapshot || overview.actorRole !== "OPERATIONS_EMERGENCY" || activationPhase === "submitting") return;
    const startIso = inputToIso(startsAt);
    const expiryIso = inputToIso(expiresAt);
    if (!edgeId || operatorNote.trim() !== operatorNote || operatorNote.length < 10 || !isHttps(sourceReference) || !isHttps(reasonEvidenceReference) || !startIso || !expiryIso || !activationAcknowledged) {
      setActivationPhase("error");
      setActivationNotice("请完整选择正式路段、填写至少 10 字的现场说明与两个 HTTPS 证据链接，并确认立即停止旧路线。 ");
      return;
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      edgeId,
      status,
      incidentType,
      operatorNote,
      sourceReference,
      reasonEvidenceReference,
      startsAt: startIso,
      expiresAt: expiryIso,
      expectedSnapshotRevision: overview.snapshot.snapshotRevision,
      acknowledgeImmediateRouteStop: true,
    });
    const attempt = activationAttempt.current?.payload === payload
      ? activationAttempt.current
      : { payload, key: `route-closure-${crypto.randomUUID()}` };
    activationAttempt.current = attempt;
    setActivationPhase("submitting");
    setActivationNotice(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setActivationPhase("error");
        setActivationNotice(errorMessage(body, "管制事件未写入；请按现场应急流程处置。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.edgeId !== edgeId || receipt.workflowRevision !== 1) {
        setActivationPhase("error");
        setActivationNotice("写入回执未通过严格校验；请向值守人员核对审计日志。 ");
        return;
      }
      activationAttempt.current = null;
      setActivationPhase("success");
      setActivationNotice("管制事件已立即生效，旧正式路线将失败关闭；事件仍待独立复核。 ");
      setOperatorNote("");
      setActivationAcknowledged(false);
      await load();
    } catch {
      setActivationPhase("error");
      setActivationNotice("网络中断，无法确认管制是否写入；保留相同内容重试可复用幂等键。 ");
    }
  }

  async function reviewClosure(decision: RouteClosureReviewDecision) {
    if (!selectedEventId || overview?.actorRole !== "RELEASE_ADMIN" || reviewPhase === "submitting") return;
    if (!isHttps(reviewEvidence) || !reviewAcknowledged) {
      setReviewPhase("error");
      setReviewNotice("请填写 HTTPS 复核证据，并确认“撤回事件不等于证明道路开放”。 ");
      return;
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      decision,
      expectedWorkflowRevision: 1,
      reviewEvidenceReference: reviewEvidence,
      acknowledgeWithdrawalIsNotProofOfOpen: true,
    });
    const attempt = reviewAttempt.current?.eventId === selectedEventId && reviewAttempt.current.payload === payload
      ? reviewAttempt.current
      : { eventId: selectedEventId, payload, key: `route-closure-review-${crypto.randomUUID()}` };
    reviewAttempt.current = attempt;
    setReviewPhase("submitting");
    setReviewNotice(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(selectedEventId)}/review`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setReviewPhase("error");
        setReviewNotice(errorMessage(body, "道路管制复核未完成。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.id !== selectedEventId || receipt.reviewDecision !== decision || receipt.workflowRevision !== 2) {
        setReviewPhase("error");
        setReviewNotice("复核回执未通过严格校验；没有在页面中假定状态已改变。 ");
        return;
      }
      reviewAttempt.current = null;
      setReviewPhase("success");
      setReviewNotice(decision === "CONFIRMED" ? "管制事件已独立确认，仍按有效期阻断旧路线。" : "管制事件已撤回；此操作不构成道路开放证明。 ");
      setSelectedEventId(null);
      setReviewEvidence("");
      setReviewAcknowledged(false);
      await load();
    } catch {
      setReviewPhase("error");
      setReviewNotice("网络中断，无法确认复核是否写入；保留相同内容重试可复用幂等键。 ");
    }
  }

  const openEdges = overview?.edges.filter((edge) => edge.safetyState === "OPEN" && edge.operationalStatus === "OPEN") ?? [];
  const pendingEvents = overview?.events.filter((event) => event.workflowRevision === 1) ?? [];

  return (
    <section className="mx-auto grid max-w-[1480px] gap-6 px-4 py-7 text-[#173f35] lg:grid-cols-[minmax(0,1.05fr)_minmax(21rem,.95fr)] lg:px-6">
      <div className="space-y-6">
        <div className="rounded-[1.8rem] border border-[#a85749]/20 bg-[#fffaf2] p-5 shadow-[0_20px_60px_rgba(57,74,65,.08)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#a85749]">Safety control</span><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">正式道路管制</h2><p className="mt-3 max-w-[68ch] text-sm leading-6 text-[#5e6f67]">只允许对当前已发布、现场核验路网中的路段操作。新增事件会立即使旧内部路线停止；没有新运营快照时不会猜测绕行。</p></div>
            <button type="button" onClick={() => void load()} disabled={phase === "loading"} className={`${buttonClass} border border-[#173f35]/14 bg-white`}><ArrowClockwise size={17} className={phase === "loading" ? "animate-spin" : ""} />刷新</button>
          </div>
          {notice ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm leading-6 ${phase === "unavailable" ? "border-[#b88a43]/25 bg-[#f5ead5]" : "border-[#a85749]/20 bg-[#f7e4df]"}`}><ShieldWarning size={19} className="mr-2 inline" />{notice}</div> : null}
          {overview?.snapshot ? (
            <dl className="mt-6 grid gap-3 rounded-2xl bg-[#173f35] p-5 text-[#fffaf0] sm:grid-cols-4">
              <div><dt className="text-[11px] text-white/60">当前身份职责</dt><dd className="mt-1 text-sm font-semibold">{overview.actorRole === "OPERATIONS_EMERGENCY" ? "紧急运营" : "独立发布复核"}</dd></div>
              <div><dt className="text-[11px] text-white/60">正式快照</dt><dd className="mt-1 text-sm font-semibold">r{overview.snapshot.snapshotRevision}</dd></div>
              <div><dt className="text-[11px] text-white/60">路网 / 运营版本</dt><dd className="mt-1 text-sm font-semibold">{overview.snapshot.networkRevision} / v{overview.snapshot.operationalVersion}</dd></div>
              <div><dt className="text-[11px] text-white/60">最早失效时间</dt><dd className="mt-1 text-sm font-semibold">{formatDateTime(overview.snapshot.validUntil)}</dd></div>
            </dl>
          ) : phase === "ready" ? <div className="mt-5 rounded-2xl border border-dashed border-[#a85749]/30 p-5 text-sm leading-6">当前没有满足发布、许可、现场核验与有效期门禁的正式路网，管制写入保持关闭。</div> : null}
        </div>

        <section aria-labelledby="route-operations-activation-title" className="rounded-[1.8rem] border border-[#173f35]/10 bg-white/70 p-5 sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f4dfda] text-[#a85749]"><Warning size={22} /></span><div><h3 id="route-operations-activation-title" className="text-xl font-semibold">立即新增管制事件</h3><p className="text-xs text-[#687871]">仅紧急运营角色可提交；最长 7 天，到期自动不再阻断。</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2" htmlFor="route-operations-edge"><span className="mb-1.5 block text-xs font-semibold">正式路段</span><select id="route-operations-edge" aria-label="正式路段" className={fieldClass} value={edgeId} onChange={(event) => { setEdgeId(event.target.value); activationAttempt.current = null; }} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"}><option value="">选择当前正式路段</option>{openEdges.map((edge) => <option key={edge.id} value={edge.id}>{edge.edgeCode} · {edge.fromNodeCode} → {edge.toNodeCode} · {Math.round(edge.distanceMeters)} m</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">通行状态</span><select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value as RouteClosureStatus)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"}><option value="CLOSED">封闭</option><option value="RESTRICTED">受限通行（路由同样阻断）</option></select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">事件类型</span><select className={fieldClass} value={incidentType} onChange={(event) => setIncidentType(event.target.value as RouteClosureIncidentType)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"}>{ROUTE_CLOSURE_INCIDENT_TYPES.map((type) => <option key={type} value={type}>{incidentLabels[type]}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-semibold">开始时间</span><input type="datetime-local" className={fieldClass} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold">到期时间</span><input type="datetime-local" className={fieldClass} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">现场说明（10–1000 字）</span><textarea className={`${fieldClass} min-h-28 resize-y`} value={operatorNote} maxLength={1000} onChange={(event) => setOperatorNote(event.target.value)} placeholder="只记录已观察或已核实的信息，不推测道路安全。" disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold">来源记录 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input type="url" className={`${fieldClass} pl-9`} value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="https://…" disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></div></label>
            <label><span className="mb-1.5 block text-xs font-semibold">原因证据 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input type="url" className={`${fieldClass} pl-9`} value={reasonEvidenceReference} onChange={(event) => setReasonEvidenceReference(event.target.value)} placeholder="https://…" disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></div></label>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#a85749]/18 bg-[#fff7f4] p-4 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#a85749]" checked={activationAcknowledged} onChange={(event) => setActivationAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /><span>我确认该操作会立即使受影响的旧正式路线停止，且提交内容仅来自已登记证据。</span></label>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void activateClosure()} disabled={!overview?.snapshot || overview.actorRole !== "OPERATIONS_EMERGENCY" || activationPhase === "submitting"} className={`${buttonClass} bg-[#a85749] text-white`}>{activationPhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <ShieldWarning size={18} />}立即生效并进入复核</button>{activationNotice ? <p className={`text-sm ${activationPhase === "success" ? "text-[#2f7d62]" : "text-[#9b493d]"}`}>{activationNotice}</p> : null}</div>
        </section>
      </div>

      <aside className="space-y-6">
        <div className="rounded-[1.8rem] border border-[#173f35]/10 bg-white/70 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><span className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#9b7a42]">Independent review</span><h3 className="mt-1 text-xl font-semibold">待独立复核 · {pendingEvents.length}</h3></div><ClockCountdown size={25} className="text-[#9b7a42]" /></div>
          <div className="mt-5 space-y-3">
            {pendingEvents.length === 0 ? <p className="rounded-2xl border border-dashed border-[#173f35]/18 p-5 text-sm leading-6 text-[#687871]">当前正式路网没有待复核管制事件。</p> : pendingEvents.map((event) => (
              <article key={event.id} className={`rounded-2xl border p-4 ${selectedEventId === event.id ? "border-[#b88a43]/45 bg-[#fffaf0]" : "border-[#173f35]/10 bg-white"}`}>
                <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-[#f4dfda] px-2.5 py-1 text-[11px] font-semibold text-[#984a3e]">{event.status === "CLOSED" ? "封闭" : "限行"}</span><h4 className="mt-2 font-semibold">{event.edgeCode}</h4></div><span className="text-[11px] text-[#75837d]">r{event.expectedSnapshotRevision}</span></div>
                <p className="mt-3 text-sm leading-6 text-[#586a62]">{event.operatorNote}</p>
                <dl className="mt-3 space-y-1 text-xs text-[#697970]"><div><dt className="inline font-semibold">类型：</dt><dd className="inline">{incidentLabels[event.incidentType]}</dd></div><div><dt className="inline font-semibold">有效：</dt><dd className="inline">{formatDateTime(event.startsAt)} 至 {formatDateTime(event.expiresAt)}</dd></div><div><dt className="inline font-semibold">发起身份：</dt><dd className="inline break-all">{event.activatedBySubject}</dd></div></dl>
                {overview?.actorRole === "RELEASE_ADMIN" ? <button type="button" onClick={() => { setSelectedEventId(event.id); setReviewPhase("idle"); setReviewNotice(null); reviewAttempt.current = null; }} className={`${buttonClass} mt-4 w-full border border-[#173f35]/14 bg-white`}>进入独立复核</button> : null}
              </article>
            ))}
          </div>
          {selectedEventId && overview?.actorRole === "RELEASE_ADMIN" ? <div className="mt-5 rounded-2xl border border-[#b88a43]/25 bg-[#f8eedb] p-4"><label><span className="mb-1.5 block text-xs font-semibold">独立复核证据 HTTPS</span><input type="url" className={fieldClass} value={reviewEvidence} onChange={(event) => setReviewEvidence(event.target.value)} placeholder="https://…" /></label><label className="mt-3 flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1 accent-[#173f35]" checked={reviewAcknowledged} onChange={(event) => setReviewAcknowledged(event.target.checked)} /><span>我确认自己不是事件发起人，并理解撤回事件只移除本事件的阻断，不证明物理道路已开放。</span></label><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void reviewClosure("CONFIRMED")} disabled={reviewPhase === "submitting"} className={`${buttonClass} bg-[#173f35] text-white`}>{reviewPhase === "submitting" ? <SpinnerGap size={17} className="animate-spin" /> : <CheckCircle size={17} />}确认管制</button><button type="button" onClick={() => void reviewClosure("WITHDRAWN")} disabled={reviewPhase === "submitting"} className={`${buttonClass} border border-[#a85749]/25 bg-white text-[#984a3e]`}><XCircle size={17} />撤回事件</button></div>{reviewNotice ? <p className={`mt-3 text-xs leading-5 ${reviewPhase === "success" ? "text-[#2f7d62]" : "text-[#984a3e]"}`}>{reviewNotice}</p> : null}</div> : null}
        </div>

        <div className="rounded-[1.8rem] border border-[#173f35]/10 bg-[#173f35] p-5 text-[#fffaf0] sm:p-6">
          <h3 className="font-semibold">最近事件</h3><p className="mt-2 text-xs leading-5 text-white/65">事件状态来自服务器时间；浏览器不会用本机时间推断是否封路。</p>
          <div className="mt-4 space-y-2">{overview?.events.slice(0, 12).map((event) => <div key={event.id} className="rounded-xl bg-white/7 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{event.edgeCode}</strong><span>{stateLabels[event.effectiveState]}</span></div><p className="mt-1 text-white/60">{event.status} · {formatDateTime(event.expiresAt)}</p></div>)}{overview && overview.events.length === 0 ? <p className="text-sm text-white/60">尚无道路管制事件。</p> : null}</div>
        </div>
      </aside>
    </section>
  );
}
