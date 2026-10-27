"use client";

import { Clock, MagicWand, Path, SpinnerGap } from "@phosphor-icons/react";
import { useState } from "react";
import {
  PEDESTRIAN_ROUTE_TRAVERSAL_MODES,
  type DirectedRoutePlan,
  type DirectedRoutePreference,
} from "@/lib/directed-route-engine";
import {
  interpretScenicItineraryPrompt,
  type FormalScenicItinerary,
  type ScenicItineraryCompanion,
} from "@/lib/formal-scenic-itinerary";
import type { RouteVisitInterest } from "@/lib/route-network";

type SmartScenicItineraryPlannerProps = {
  scenicAreaId: string;
  networkRevision: string;
  operationalVersion: number;
  originNodeId: string;
  exitNodeId: string;
  stepFree: boolean;
  allowCableway: boolean;
  allowShuttle: boolean;
  maximumDifficulty: DirectedRoutePreference["maximumDifficulty"];
  onUseSegment: (plan: DirectedRoutePlan) => void;
};

const INTEREST_OPTIONS: Array<{ value: RouteVisitInterest; label: string }> = [
  { value: "HISTORY", label: "历史" },
  { value: "CULTURE", label: "文化" },
  { value: "NATURE", label: "自然" },
  { value: "PHOTOGRAPHY", label: "摄影" },
  { value: "FAMILY", label: "亲子" },
  { value: "REST", label: "休息" },
];

const COMPANION_LABELS: Record<ScenicItineraryCompanion, string> = {
  SOLO: "独自",
  FRIENDS: "朋友同行",
  FAMILY: "亲子",
  SENIOR: "长辈同行",
};

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function isPlan(value: unknown): value is DirectedRoutePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<DirectedRoutePlan>;
  return plan.schemaVersion === 1
    && typeof plan.routeFingerprint === "string"
    && /^drp1-[0-9a-f]{8}$/.test(plan.routeFingerprint)
    && typeof plan.scenicAreaId === "string"
    && typeof plan.networkRevision === "string"
    && Number.isSafeInteger(plan.operationalVersion)
    && typeof plan.originNodeId === "string"
    && typeof plan.destinationNodeId === "string"
    && Array.isArray(plan.edgeIds)
    && typeof plan.distanceMeters === "number"
    && typeof plan.estimatedMinutes === "number"
    && typeof plan.expiresAt === "string"
    && plan.geometry?.type === "LineString"
    && Array.isArray(plan.geometry.coordinates)
    && plan.geometry.coordinates.length >= 2
    && plan.geometry.coordinates.every((coordinate) => (
      Array.isArray(coordinate)
      && coordinate.length === 2
      && Number.isFinite(coordinate[0])
      && Number.isFinite(coordinate[1])
      && coordinate[0] >= -180
      && coordinate[0] <= 180
      && coordinate[1] >= -90
      && coordinate[1] <= 90
    ));
}

function isItinerary(value: unknown): value is FormalScenicItinerary {
  if (!value || typeof value !== "object") return false;
  const itinerary = value as Partial<FormalScenicItinerary>;
  return itinerary.schemaVersion === 1
    && typeof itinerary.itineraryFingerprint === "string"
    && /^sip1-[0-9a-f]{8}$/.test(itinerary.itineraryFingerprint)
    && typeof itinerary.scenicAreaId === "string"
    && typeof itinerary.networkRevision === "string"
    && Number.isSafeInteger(itinerary.operationalVersion)
    && typeof itinerary.originNodeId === "string"
    && typeof itinerary.exitNodeId === "string"
    && Number.isSafeInteger(itinerary.budgetMinutes)
    && typeof itinerary.totalMinutes === "number"
    && typeof itinerary.totalDistanceMeters === "number"
    && Array.isArray(itinerary.interests)
    && itinerary.interests.length > 0
    && itinerary.interests.every((interest) => INTEREST_OPTIONS.some((option) => option.value === interest))
    && new Set(itinerary.interests).size === itinerary.interests.length
    && typeof itinerary.companion === "string"
    && Object.hasOwn(COMPANION_LABELS, itinerary.companion)
    && Array.isArray(itinerary.stops)
    && itinerary.stops.length > 0
    && itinerary.stops.every((stop) => (
      typeof stop.nodeId === "string"
      && typeof stop.displayName === "string"
      && typeof stop.dwellMinutes === "number"
      && Array.isArray(stop.matchedInterests)
      && typeof stop.evidenceReference === "string"
    ))
    && Array.isArray(itinerary.segments)
    && itinerary.segments.length === itinerary.stops.length + 1
    && itinerary.segments.every(isPlan)
    && itinerary.segments[0].originNodeId === itinerary.originNodeId
    && itinerary.segments.at(-1)?.destinationNodeId === itinerary.exitNodeId
    && itinerary.segments.every((segment, index) => (
      index === 0 || segment.originNodeId === (itinerary.segments as DirectedRoutePlan[])[index - 1].destinationNodeId
    ));
}

export function SmartScenicItineraryPlanner({
  scenicAreaId,
  networkRevision,
  operationalVersion,
  originNodeId,
  exitNodeId,
  stepFree,
  allowCableway,
  allowShuttle,
  maximumDifficulty,
  onUseSegment,
}: SmartScenicItineraryPlannerProps) {
  const [prompt, setPrompt] = useState("我只有3小时，希望轻松游玩，喜欢历史和摄影");
  const [budgetMinutes, setBudgetMinutes] = useState<number | null>(null);
  const [pace, setPace] = useState<DirectedRoutePreference["pace"]>("BALANCED");
  const [interests, setInterests] = useState<RouteVisitInterest[]>([]);
  const [companion, setCompanion] = useState<ScenicItineraryCompanion>("SOLO");
  const [analyzed, setAnalyzed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("先解析需求，再由你确认时间、兴趣和同行方式；原始文字不会发送到服务端。");
  const [itinerary, setItinerary] = useState<FormalScenicItinerary | null>(null);

  function analyze() {
    const intent = interpretScenicItineraryPrompt(prompt);
    setItinerary(null);
    if (!intent) {
      setAnalyzed(false);
      setMessage("请输入 500 字以内的游览需求。 ");
      return;
    }
    setBudgetMinutes(intent.budgetMinutes);
    setPace(intent.pace);
    setInterests(intent.interests);
    setCompanion(intent.companion);
    setAnalyzed(true);
    setMessage(intent.needsConfirmation.length
      ? "仍有未识别条件，请在下方补全后再生成。"
      : "已在本机解析为结构化约束，请核对后生成正式路线。 ");
  }

  function toggleInterest(interest: RouteVisitInterest) {
    setItinerary(null);
    setInterests((current) => current.includes(interest)
      ? current.filter((value) => value !== interest)
      : [...current, interest]);
  }

  async function generate() {
    if (!budgetMinutes || interests.length === 0 || !originNodeId || !exitNodeId) {
      setMessage("请确认 1–8 小时时间、至少一个兴趣，以及正式入口/出口。 ");
      return;
    }
    setBusy(true);
    setItinerary(null);
    setMessage("正在用当前正式路网组合景点、停留时间和返程路线…");
    try {
      const allowedTraversalModes = [
        ...PEDESTRIAN_ROUTE_TRAVERSAL_MODES.filter((mode) => !stepFree || mode !== "STAIRS"),
        ...(allowCableway ? ["CABLEWAY" as const] : []),
        ...(allowShuttle ? ["SHUTTLE" as const] : []),
      ];
      const response = await fetch("/api/v1/scenic-itineraries", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenicAreaId,
          originNodeId,
          exitNodeId,
          expectedNetworkRevision: networkRevision,
          expectedOperationalVersion: operationalVersion,
          budgetMinutes,
          interests,
          companion,
          maxStops: 6,
          profile: stepFree
            ? { kind: "STEP_FREE", maxSlopePercent: 5, minimumWidthMeters: 0.9 }
            : { kind: "WALK", maxSlopePercent: null, minimumWidthMeters: null },
          preference: { pace, maximumDifficulty, allowedTraversalModes },
        }),
      });
      const body = await response.json() as unknown;
      const candidate = body && typeof body === "object" ? (body as { itinerary?: unknown }).itinerary : null;
      if (
        !response.ok
        || !isItinerary(candidate)
        || candidate.scenicAreaId !== scenicAreaId
        || candidate.networkRevision !== networkRevision
        || candidate.operationalVersion !== operationalVersion
        || candidate.originNodeId !== originNodeId
        || candidate.exitNodeId !== exitNodeId
        || candidate.budgetMinutes !== budgetMinutes
        || candidate.companion !== companion
        || candidate.interests.length !== interests.length
        || candidate.interests.some((interest) => !interests.includes(interest))
        || candidate.segments.some((segment) => (
          segment.scenicAreaId !== scenicAreaId
          || segment.networkRevision !== networkRevision
          || segment.operationalVersion !== operationalVersion
        ))
      ) {
        setMessage(responseMessage(body, "当前没有符合这些条件的正式游览路线。"));
        return;
      }
      setItinerary(candidate);
      setMessage("路线只使用已发布游览标签和正式路网；你可以从首段开始导航。 ");
    } catch {
      setMessage("个性路线服务暂时不可用，没有生成候选折线代替。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-5 rounded-2xl border border-[#b88a43]/20 bg-[#f7f0e4] p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#173f35] outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]"><MagicWand size={20} weight="duotone" />AI 智能游览路线</summary>
      <p className="mt-2 text-xs leading-5 text-[#61716a]">AI 只在本机把自然语言转换为可确认约束；景点选择、停留预算和每段路线由正式数据与确定性算法完成。</p>
      <label htmlFor="smart-itinerary-prompt" className="mt-4 block text-sm font-semibold text-[#173f35]">告诉我时间与偏好</label>
      <textarea id="smart-itinerary-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); setAnalyzed(false); setItinerary(null); }} maxLength={500} rows={3} className="mt-2 w-full rounded-xl border border-[#173f35]/16 bg-white p-3 text-sm leading-6" />
      <button type="button" onClick={analyze} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-4 text-sm font-semibold text-[#173f35]"><MagicWand size={18} />解析为可确认条件</button>

      {analyzed && <div className="mt-4 grid gap-4 rounded-xl bg-white p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[#173f35]">总时长<select value={budgetMinutes ?? ""} onChange={(event) => setBudgetMinutes(event.target.value ? Number(event.target.value) : null)} className="min-h-11 rounded-lg border border-[#173f35]/14 bg-white px-3 text-sm"><option value="">请选择</option><option value="60">1 小时</option><option value="120">2 小时</option><option value="180">3 小时</option><option value="240">4 小时</option><option value="360">6 小时</option><option value="480">8 小时</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-[#173f35]">同行方式<select value={companion} onChange={(event) => setCompanion(event.target.value as ScenicItineraryCompanion)} className="min-h-11 rounded-lg border border-[#173f35]/14 bg-white px-3 text-sm">{Object.entries(COMPANION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <fieldset><legend className="text-xs font-semibold text-[#173f35]">兴趣（可多选）</legend><div className="mt-2 flex flex-wrap gap-2">{INTEREST_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={interests.includes(option.value)} onClick={() => toggleInterest(option.value)} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${interests.includes(option.value) ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/14 bg-white text-[#173f35]"}`}>{option.label}</button>)}</div></fieldset>
        <label className="grid gap-1 text-xs font-semibold text-[#173f35]">游览节奏<select value={pace} onChange={(event) => setPace(event.target.value as DirectedRoutePreference["pace"])} className="min-h-11 rounded-lg border border-[#173f35]/14 bg-white px-3 text-sm"><option value="RELAXED">轻松</option><option value="BALANCED">均衡</option><option value="ACTIVE">活力</option></select></label>
        <button type="button" onClick={() => void generate()} disabled={busy || !budgetMinutes || interests.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white disabled:opacity-55">{busy ? <SpinnerGap className="animate-spin motion-reduce:animate-none" size={18} /> : <Path size={18} />}{busy ? "正在编排" : "生成正式个性路线"}</button>
      </div>}

      {itinerary && <div className="mt-4 rounded-xl border border-[#173f35]/12 bg-white p-4">
        <div className="flex items-center gap-2 text-[#173f35]"><Clock size={19} /><strong>{Math.ceil(itinerary.totalMinutes)} 分钟 · {(itinerary.totalDistanceMeters / 1000).toFixed(1)} km</strong></div>
        <ol className="mt-3 space-y-2">{itinerary.stops.map((stop, index) => <li key={stop.nodeId} className="grid grid-cols-[auto_1fr] gap-3 rounded-xl bg-[#f5f7f3] p-3"><span className="grid size-7 place-items-center rounded-full bg-[#b88a43] text-xs font-bold text-white">{index + 1}</span><span><strong className="block text-sm text-[#173f35]">{stop.displayName}</strong><span className="mt-1 block text-xs leading-5 text-[#61716a]">停留 {stop.dwellMinutes} 分钟{stop.photoSpot ? " · 拍照点" : ""}{stop.restArea ? " · 可休息" : ""}</span><span className="mt-1 block break-all text-[10px] text-[#718078]">依据：{stop.evidenceReference}</span></span></li>)}</ol>
        <button type="button" onClick={() => onUseSegment(itinerary.segments[0])} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2369d8] px-4 text-sm font-semibold text-white"><Path size={18} />使用首段开始导航</button>
      </div>}
      <p role="status" aria-live="polite" className="mt-3 text-xs leading-5 text-[#61716a]">{message}</p>
    </details>
  );
}
