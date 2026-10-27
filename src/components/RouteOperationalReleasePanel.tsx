"use client";

import {
  ArrowClockwise,
  ArrowsClockwise,
  CheckCircle,
  ClockCountdown,
  FileLock,
  LinkSimple,
  ShieldCheck,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseRouteOperationalReleaseOverview,
  parseRouteOperationalReleaseReceipt,
  type RouteOperationalReleaseOverview,
} from "@/lib/route-operational-release-contract";

const ENDPOINT = "/api/v1/admin/scenic-areas/liuzu-town/route-operational-releases";
const fieldClass = "w-full rounded-xl border border-[#173f35]/15 bg-white px-3.5 py-3 text-sm text-[#173f35] outline-none focus:border-[#b88a43] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

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
  return parseRouteOperationalReleaseOverview(value.overview);
}

function parseReceiptEnvelope(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "receipt"]) || value.schemaVersion !== 1 || !isUuid(value.requestId)) return null;
  return parseRouteOperationalReleaseReceipt(value.receipt);
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

export function RouteOperationalReleasePanel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<RouteOperationalReleaseOverview | null>(null);
  const [sourceReference, setSourceReference] = useState("");
  const [reasonSummary, setReasonSummary] = useState("");
  const [prepareAcknowledged, setPrepareAcknowledged] = useState(false);
  const [preparePhase, setPreparePhase] = useState<WritePhase>("idle");
  const [prepareNotice, setPrepareNotice] = useState<string | null>(null);
  const [releaseEvidence, setReleaseEvidence] = useState("");
  const [replacementAcknowledged, setReplacementAcknowledged] = useState(false);
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false);
  const [publishPhase, setPublishPhase] = useState<WritePhase>("idle");
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const prepareAttempt = useRef<{ payload: string; key: string } | null>(null);
  const publishAttempt = useRef<{ releaseId: string; payload: string; key: string } | null>(null);

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
        setNotice(errorMessage(body, "运营快照发布服务暂不可用。"));
        setOverview(null);
        return;
      }
      const parsed = parseOverviewEnvelope(body);
      if (!parsed) {
        setPhase("error");
        setNotice("发布响应未通过严格结构校验，页面没有采用其中的候选或版本状态。");
        setOverview(null);
        return;
      }
      setOverview(parsed);
      setPhase("ready");
    } catch {
      if (sequence !== loadSequence.current) return;
      setPhase("error");
      setNotice("无法连接运营快照发布服务；没有创建或替换正式快照。");
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); loadSequence.current += 1; };
  }, [load]);

  async function prepare() {
    if (!overview?.currentSnapshot || overview.actorRole !== "OPERATIONS_EMERGENCY" || preparePhase === "submitting") return;
    if (!isHttps(sourceReference) || reasonSummary.trim() !== reasonSummary || reasonSummary.length < 10 || !prepareAcknowledged) {
      setPreparePhase("error");
      setPrepareNotice("请填写 HTTPS 发布依据、至少 10 字的准备说明，并确认只编译已独立确认的事件与动态观测。");
      return;
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      expectedSnapshotRevision: overview.currentSnapshot.snapshotRevision,
      sourceReference,
      reasonSummary,
      acknowledgeConfirmedEventsOnly: true,
      acknowledgeReviewedFactorsOnly: true,
    });
    const attempt = prepareAttempt.current?.payload === payload
      ? prepareAttempt.current
      : { payload, key: `route-operational-release-${crypto.randomUUID()}` };
    prepareAttempt.current = attempt;
    setPreparePhase("submitting");
    setPrepareNotice(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setPreparePhase("error");
        setPrepareNotice(errorMessage(body, "替代运营快照候选未创建。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.baseSnapshotRevision !== overview.currentSnapshot.snapshotRevision || receipt.workflowRevision !== 1) {
        setPreparePhase("error");
        setPrepareNotice("候选回执未通过版本或结构校验；没有假定候选已创建。");
        return;
      }
      prepareAttempt.current = null;
      setPreparePhase("success");
      setPrepareNotice("不可变候选已生成，等待另一位发布管理员原子替换正式快照。");
      setPrepareAcknowledged(false);
      setReasonSummary("");
      await load();
    } catch {
      setPreparePhase("error");
      setPrepareNotice("网络中断，无法确认候选是否创建；保持相同内容重试可复用幂等键。");
    }
  }

  async function publish() {
    const candidate = overview?.candidate;
    if (!candidate || overview?.actorRole !== "RELEASE_ADMIN" || publishPhase === "submitting") return;
    if (!isHttps(releaseEvidence) || !replacementAcknowledged || !offlineAcknowledged) {
      setPublishPhase("error");
      setPublishNotice("请填写 HTTPS 发布证据，并确认原子替换与旧离线包失效两项影响。");
      return;
    }
    const payload = JSON.stringify({
      schemaVersion: 1,
      expectedWorkflowRevision: 1,
      releaseEvidenceReference: releaseEvidence,
      acknowledgeAtomicReplacement: true,
      acknowledgeOfflinePacksInvalidated: true,
    });
    const attempt = publishAttempt.current?.releaseId === candidate.id && publishAttempt.current.payload === payload
      ? publishAttempt.current
      : { releaseId: candidate.id, payload, key: `route-operational-publish-${crypto.randomUUID()}` };
    publishAttempt.current = attempt;
    setPublishPhase("submitting");
    setPublishNotice(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(candidate.id)}/publish`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: payload,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setPublishPhase("error");
        setPublishNotice(errorMessage(body, "替代运营快照未发布。"));
        return;
      }
      const receipt = parseReceiptEnvelope(body);
      if (!receipt || receipt.id !== candidate.id || receipt.workflowRevision !== 2 || receipt.lifecycleState !== "PUBLISHED") {
        setPublishPhase("error");
        setPublishNotice("发布回执未通过严格校验；页面没有假定快照已替换。");
        return;
      }
      publishAttempt.current = null;
      setPublishPhase("success");
      setPublishNotice(`正式快照已更新为 r${receipt.targetSnapshotRevision} / 运营 v${receipt.targetOperationalVersion}，导航端将按版本变化重新规划。`);
      setReleaseEvidence("");
      setReplacementAcknowledged(false);
      setOfflineAcknowledged(false);
      await load();
    } catch {
      setPublishPhase("error");
      setPublishNotice("网络中断，无法确认发布结果；保持相同内容重试可复用幂等键。");
    }
  }

  const prepareBlocked = !overview?.currentSnapshot
    || overview.pendingEventCount > 0 || overview.pendingObservationCount > 0
    || overview.confirmedEventCount + overview.confirmedObservationCount < 1
    || overview.candidate !== null;

  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-10 lg:px-6">
      <div className="rounded-[1.8rem] border border-[#173f35]/12 bg-[#173f35] p-5 text-[#fffaf0] shadow-[0_24px_70px_rgba(23,63,53,.16)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-[#d8b875]">Operational release</span>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">替代运营快照发布</h2>
            <p className="mt-3 max-w-[76ch] text-sm leading-6 text-white/70">把已独立确认的封闭、限行、客流与天气观测编译为覆盖全部正式路段的新运营状态。路网几何保持不变；发布会原子撤下旧快照，并使旧离线包失效。</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={phase === "loading"} className={`${buttonClass} border border-white/15 bg-white/8 text-white`}><ArrowClockwise size={17} className={phase === "loading" ? "animate-spin" : ""} />刷新发布状态</button>
        </div>

        {notice ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm leading-6 ${phase === "unavailable" ? "border-[#d8b875]/30 bg-[#d8b875]/10" : "border-[#df8a7e]/30 bg-[#df8a7e]/10"}`}><Warning size={18} className="mr-2 inline" />{notice}</div> : null}

        {overview ? (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">当前职责</dt><dd className="mt-1 text-sm font-semibold">{overview.actorRole === "OPERATIONS_EMERGENCY" ? "运营候选准备" : "独立发布"}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">当前正式版本</dt><dd className="mt-1 text-sm font-semibold">{overview.currentSnapshot ? `r${overview.currentSnapshot.snapshotRevision} / v${overview.currentSnapshot.operationalVersion}` : "无可用快照"}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">待复核事件</dt><dd className="mt-1 text-sm font-semibold">{overview.pendingEventCount}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">已确认有效事件</dt><dd className="mt-1 text-sm font-semibold">{overview.confirmedEventCount}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">待复核观测</dt><dd className="mt-1 text-sm font-semibold">{overview.pendingObservationCount}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">已确认有效观测</dt><dd className="mt-1 text-sm font-semibold">{overview.confirmedObservationCount}</dd></div>
            <div className="rounded-2xl bg-white/8 p-4"><dt className="text-[11px] text-white/55">替代候选</dt><dd className="mt-1 text-sm font-semibold">{overview.candidate ? `r${overview.candidate.targetSnapshotRevision} 待发布` : "尚无"}</dd></div>
          </dl>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-[1.8rem] border border-[#173f35]/10 bg-white/75 p-5 text-[#173f35] sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#e6efe9]"><ArrowsClockwise size={22} /></span><div><h3 className="text-xl font-semibold">1. 生成完整候选</h3><p className="text-xs text-[#687871]">仅紧急运营角色；存在待复核事件或观测时失败关闭。</p></div></div>
          <div className="mt-5 space-y-4">
            <label><span className="mb-1.5 block text-xs font-semibold">编译与发布依据 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input type="url" className={`${fieldClass} pl-9`} value={sourceReference} onChange={(event) => { setSourceReference(event.target.value); prepareAttempt.current = null; }} placeholder="https://…" disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></div></label>
            <label><span className="mb-1.5 block text-xs font-semibold">准备说明（10–1000 字）</span><textarea className={`${fieldClass} min-h-28 resize-y`} value={reasonSummary} maxLength={1000} onChange={(event) => { setReasonSummary(event.target.value); prepareAttempt.current = null; }} placeholder="说明本次候选对应的已确认事件、动态观测与运营目的，不填写推测性开放结论。" disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /></label>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#173f35]/12 bg-[#f1f6f3] p-4 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#173f35]" checked={prepareAcknowledged} onChange={(event) => setPrepareAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY"} /><span>我确认只编译当前正式路网中已由另一身份确认、未撤回且未到期的管制事件，以及每条路段最新的已复核客流/天气观测；任何待复核项都会阻断候选。</span></label>
          {overview?.pendingEventCount ? <p className="mt-4 rounded-xl bg-[#f7e4df] px-4 py-3 text-sm text-[#8c4339]">仍有 {overview.pendingEventCount} 项待独立复核，当前不能准备候选。</p> : null}
          {overview?.pendingObservationCount ? <p className="mt-4 rounded-xl bg-[#f7e4df] px-4 py-3 text-sm text-[#8c4339]">仍有 {overview.pendingObservationCount} 项客流/天气观测待独立复核，当前不能准备候选。</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void prepare()} disabled={overview?.actorRole !== "OPERATIONS_EMERGENCY" || prepareBlocked || preparePhase === "submitting"} className={`${buttonClass} bg-[#173f35] text-white`}>{preparePhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <FileLock size={18} />}生成不可变候选</button>{prepareNotice ? <p className={`text-sm ${preparePhase === "success" ? "text-[#2f7d62]" : "text-[#a85749]"}`}>{prepareNotice}</p> : null}</div>
        </article>

        <article className="rounded-[1.8rem] border border-[#b88a43]/18 bg-[#fffaf2] p-5 text-[#173f35] sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f4e8cf] text-[#8a6b32]"><ShieldCheck size={22} /></span><div><h3 className="text-xl font-semibold">2. 独立原子发布</h3><p className="text-xs text-[#687871]">发布人必须与候选准备人身份不同。</p></div></div>
          {overview?.candidate ? (
            <div className="mt-5 rounded-2xl border border-[#b88a43]/20 bg-white p-4 text-sm leading-6">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle size={18} className="text-[#2f7d62]" />候选 r{overview.candidate.targetSnapshotRevision} / v{overview.candidate.targetOperationalVersion}</div>
              <p className="mt-2 text-[#687871]">编译 {overview.candidate.confirmedEventCount} 项事件与 {overview.candidate.confirmedObservationCount} 项动态观测，影响 {overview.candidate.affectedEdgeCount} 条正式边；几何未改变。</p>
              <p className="mt-1 text-xs text-[#687871]"><ClockCountdown size={15} className="mr-1 inline" />有效至 {formatDateTime(overview.candidate.expiresAt)}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-[#7b6b4f]">SHA-256 {overview.candidate.snapshotSha256}</p>
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-[#b88a43]/30 p-5 text-sm text-[#687871]">当前没有待发布候选。候选只能由紧急运营身份从已确认事件和已复核动态观测生成。</div>}
          <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold">独立发布证据 HTTPS</span><div className="relative"><LinkSimple size={16} className="absolute left-3 top-3.5 text-[#8a7550]" /><input type="url" className={`${fieldClass} pl-9`} value={releaseEvidence} onChange={(event) => { setReleaseEvidence(event.target.value); publishAttempt.current = null; }} placeholder="https://…" disabled={overview?.actorRole !== "RELEASE_ADMIN" || !overview?.candidate} /></div></label>
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 rounded-2xl border border-[#b88a43]/18 bg-white p-4 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#8a6b32]" checked={replacementAcknowledged} onChange={(event) => setReplacementAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "RELEASE_ADMIN" || !overview?.candidate} /><span>我确认发布会在同一事务中撤下基础快照并启用新运营版本，旧导航必须按版本变化重算。</span></label>
            <label className="flex items-start gap-3 rounded-2xl border border-[#b88a43]/18 bg-white p-4 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#8a6b32]" checked={offlineAcknowledged} onChange={(event) => setOfflineAcknowledged(event.target.checked)} disabled={overview?.actorRole !== "RELEASE_ADMIN" || !overview?.candidate} /><span>我确认绑定旧快照或旧运营版本的离线包将失效，必须重新审核、签名和分发。</span></label>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void publish()} disabled={overview?.actorRole !== "RELEASE_ADMIN" || !overview?.candidate || publishPhase === "submitting"} className={`${buttonClass} bg-[#b88a43] text-white`}>{publishPhase === "submitting" ? <SpinnerGap size={18} className="animate-spin" /> : <ShieldCheck size={18} />}原子发布替代快照</button>{publishNotice ? <p className={`text-sm ${publishPhase === "success" ? "text-[#2f7d62]" : "text-[#a85749]"}`}>{publishNotice}</p> : null}</div>
        </article>
      </div>
    </section>
  );
}
