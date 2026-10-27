"use client";

import {
  Check,
  Headphones,
  MapPin,
  Pause,
  Play,
  ShieldWarning,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGuideRouteSignature,
  createGuideSession,
  createGuideSessionPlanBinding,
  matchGuideSessionContext,
  readGuideSession,
  transitionGuideSession,
  writeGuideSession,
  type GuideSessionRecord,
} from "@/lib/guide-session-store";
import {
  buildForegroundDistanceAnnouncement,
  createForegroundApproachTracker,
  evaluateForegroundGuidance,
  formatForegroundDistance,
  shouldRunForegroundGuidance,
  type ForegroundApproachTracker,
  type ForegroundGuidanceEvaluation,
} from "@/lib/foreground-guidance";
import { commitGuideArrival, recoverGuideArrivalTransaction } from "@/lib/guide-arrival-transaction";
import { evaluateRouteDisruption } from "@/lib/route-disruption";
import { createJourneyId, readJourneyData } from "@/lib/journey-store";
import {
  ACCESSIBILITY_PREFERENCES_EVENT,
  ACCESSIBILITY_PREFERENCES_KEY,
  PROJECT_DATA_CLEARED_EVENT,
  parseAccessibilityPreferences,
  readAccessibilityPreferences,
} from "@/lib/accessibility-preferences";
import {
  readRoutePlan,
  resolveRoutePlanStops,
  type RoutePlan,
  type RoutePlanStop,
} from "@/lib/route-plan-store";
import { scenicSpots } from "@/lib/scenic-data";
import { DetailedMapSurface } from "./DetailedMapSurface";
import { PublicNavigationPanel } from "./PublicNavigationPanel";

type RouteFeature = { properties: { from: string; to: string; distance_m: number } };
type LocationQuality = "idle" | "requesting" | "reliable" | "low" | "denied" | "timeout" | "error" | "unsupported";

function stopConfidenceLabel(confidence: RoutePlanStop["confidence"]) {
  return confidence === "EXPLICIT" ? "原文明示" : "别名匹配";
}

export function LiveGuide() {
  const params = useSearchParams();
  const requestedParam = params.get("stops") ?? "";
  const planId = params.get("planId")?.trim() ?? "";
  const demoMode = params.get("demo") === "1";
  const fallbackStops = useMemo(() => {
    const requested = requestedParam.split(",").filter(Boolean);
    const selected = requested
      .map((id) => scenicSpots.find((spot) => spot.id === id && spot.id !== "zangfo-valley"))
      .filter((spot): spot is (typeof scenicSpots)[number] => Boolean(spot));
    return selected.length
      ? selected
      : scenicSpots.filter((spot) => ["guoen-temple", "huineng-residence", "longshan-spring"].includes(spot.id));
  }, [requestedParam]);

  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [planStops, setPlanStops] = useState<RoutePlanStop[]>([]);
  const [planLoading, setPlanLoading] = useState(Boolean(planId));
  const [planError, setPlanError] = useState<string | null>(null);
  const stops = useMemo(() => {
    if (!planId) return fallbackStops;
    return planStops.flatMap((plannedStop) => {
      const spot = scenicSpots.find((candidate) => candidate.id === plannedStop.id);
      return spot ? [spot] : [];
    });
  }, [fallbackStops, planId, planStops]);
  const planStopById = useMemo(() => new Map(planStops.map((stop) => [stop.id, stop])), [planStops]);
  const sessionPlanBinding = useMemo(() => (plan ? createGuideSessionPlanBinding(plan) : null), [plan]);

  const canStartDemo = demoMode && (!planId || Boolean(plan?.validation.demoEligible && !planError));
  const routeSignature = useMemo(
    () => (stops.length ? createGuideRouteSignature(stops.map((stop) => stop.id)) : ""),
    [stops],
  );
  const routeDisruptionDecision = useMemo(
    () => evaluateRouteDisruption({ network: null, route: null, position: null }),
    [],
  );
  const [guideSession, setGuideSession] = useState<GuideSessionRecord | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [endConfirming, setEndConfirming] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationQuality, setLocationQuality] = useState<LocationQuality>("idle");
  const [locationStatus, setLocationStatus] = useState("前台连续定位默认关闭；刷新或恢复演示后不会自动开启。");
  const [trackingRequested, setTrackingRequested] = useState(false);
  const [guidance, setGuidance] = useState<ForegroundGuidanceEvaluation | null>(null);
  const [localMuted, setLocalMuted] = useState(false);
  const [globalMuted, setGlobalMuted] = useState(false);
  const [networkDistance, setNetworkDistance] = useState<number | null>(null);
  const [sessionNotice, setSessionNotice] = useState("");
  const geolocationWatchRef = useRef<number | null>(null);
  const approachTrackerRef = useRef<ForegroundApproachTracker>(createForegroundApproachTracker(""));
  const siteHelpRef = useRef<HTMLDivElement>(null);

  const muted = globalMuted || localMuted;

  const session = guideSession?.status ?? "IDLE";
  const currentIndex = guideSession?.currentIndex ?? 0;
  const current = stops[Math.min(currentIndex, Math.max(0, stops.length - 1))];
  const next = stops[currentIndex + 1];
  const segmentKey = current && next ? `${current.id}--${next.id}` : null;
  const currentPlanStop = current ? planStopById.get(current.id) ?? null : null;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!planId) {
        setPlan(null);
        setPlanStops([]);
        setPlanError(null);
        setPlanLoading(false);
        return;
      }

      setPlanLoading(true);
      const result = readRoutePlan(planId);
      if (!result.plan || result.error) {
        setPlan(null);
        setPlanStops([]);
        setPlanError(result.error ?? "路线信息无法读取，请返回规划页重新生成。");
        setPlanLoading(false);
        return;
      }
      const resolved = resolveRoutePlanStops(result.plan, scenicSpots.map((spot) => spot.id));
      if (!resolved.ok) {
        setPlan(null);
        setPlanStops([]);
        setPlanError(resolved.error);
        setPlanLoading(false);
        return;
      }
      setPlan(result.plan);
      setPlanStops(resolved.stops);
      setPlanError(null);
      setPlanLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setGuideSession(null);
      setEndConfirming(false);
      if (planLoading || !canStartDemo || !routeSignature) {
        setSessionReady(!planLoading);
        return;
      }

      const recovery = recoverGuideArrivalTransaction();
      if (!recovery.ok) {
        setSessionNotice(recovery.error);
        setSessionReady(true);
        return;
      }
      const stored = readGuideSession();
      if (stored.record) {
        const contextMatch = matchGuideSessionContext(stored.record, stops.map((stop) => stop.id), sessionPlanBinding);
        if (contextMatch.ok) {
          setGuideSession(stored.record);
          setSessionNotice(`${recovery.recovered ? "上一次未完成的到点保存已安全回退。" : ""}已从这台设备恢复演示进度，会话修订 ${stored.record.revision}。`);
        } else {
          setSessionNotice(contextMatch.error);
        }
      } else if (stored.error) {
        setSessionNotice(`${stored.error} 你仍可从头开始当前演示。`);
      } else {
        setSessionNotice("");
      }
      setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [canStartDemo, planLoading, routeSignature, sessionPlanBinding, stops]);

  useEffect(() => {
    if (!segmentKey || !current || !next) {
      queueMicrotask(() => setNetworkDistance(null));
      return;
    }
    let cancelled = false;
    fetch("/data/gis/prototype-routes.geojson")
      .then((response) => response.json())
      .then((data: { features: RouteFeature[] }) => {
        const route = data.features.find(
          (feature) =>
            (feature.properties.from === current.id && feature.properties.to === next.id) ||
            (feature.properties.from === next.id && feature.properties.to === current.id),
        );
        if (!cancelled) setNetworkDistance(route?.properties.distance_m ?? null);
      })
      .catch(() => {
        if (!cancelled) setNetworkDistance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [current, next, segmentKey]);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    const applyPreferences = (preferences: ReturnType<typeof readAccessibilityPreferences>["preferences"]) => {
      setGlobalMuted(preferences.muted);
      if (preferences.muted) cancelSpeech();
    };
    const syncPreferences = (event?: Event) => {
      if (event instanceof StorageEvent && event.key !== ACCESSIBILITY_PREFERENCES_KEY && event.key !== null) return;
      if (event?.type === ACCESSIBILITY_PREFERENCES_EVENT) {
        const direct = parseAccessibilityPreferences((event as CustomEvent<unknown>).detail);
        if (direct) {
          applyPreferences(direct);
          return;
        }
      }
      applyPreferences(readAccessibilityPreferences(window.localStorage).preferences);
    };

    syncPreferences();
    window.addEventListener("storage", syncPreferences);
    window.addEventListener(ACCESSIBILITY_PREFERENCES_EVENT, syncPreferences);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(ACCESSIBILITY_PREFERENCES_EVENT, syncPreferences);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, syncPreferences);
    };
  }, [cancelSpeech]);

  const clearForegroundWatch = useCallback(() => {
    const watchId = geolocationWatchRef.current;
    if (watchId === null) return;
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // Clearing is best-effort; the local ref is still invalidated below.
      }
    }
    geolocationWatchRef.current = null;
  }, []);

  const stopForegroundGuidance = useCallback((message: string, quality: LocationQuality = "idle", reportedAccuracy: number | null = null) => {
    clearForegroundWatch();
    cancelSpeech();
    approachTrackerRef.current = createForegroundApproachTracker("");
    setTrackingRequested(false);
    setGuidance(null);
    setAccuracy(reportedAccuracy);
    setLocationQuality(quality);
    setLocationStatus(message);
  }, [cancelSpeech, clearForegroundWatch]);

  useEffect(() => {
    if (!trackingRequested || !current) return;
    const gate = {
      userEnabled: trackingRequested,
      demoMode,
      canStartDemo,
      sessionStatus: guideSession?.status ?? "IDLE",
    } as const;
    if (!shouldRunForegroundGuidance(gate) || !("geolocation" in navigator)) return;

    const target = {
      id: current.id,
      name: current.name,
      latitude: current.latitude,
      longitude: current.longitude,
    };
    let disposed = false;
    const onPosition = (result: GeolocationPosition) => {
      if (disposed) return;
      const sample = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
        timestamp: result.timestamp,
      };
      const evaluation = evaluateForegroundGuidance({
        sample,
        target,
        gate,
        previousTracker: approachTrackerRef.current,
      });
      if (evaluation.quality === "invalid") {
        disposed = true;
        stopForegroundGuidance("浏览器返回了无效定位，已停止连续定位；不会显示距离或接近提示。", "error");
        return;
      }
      if (evaluation.quality === "low_accuracy") {
        disposed = true;
        stopForegroundGuidance(
          `浏览器报告精度约 ${Math.round(result.coords.accuracy)} 米，超过演示门限，已停止连续定位；不会据此提示接近或到点。`,
          "low",
          result.coords.accuracy,
        );
        return;
      }
      approachTrackerRef.current = evaluation.tracker;
      setGuidance(evaluation);
      setAccuracy(result.coords.accuracy);
      setLocationQuality("reliable");
      setLocationStatus("前台连续定位正在更新；仅显示到下一站的粗略直线距离与方位。");
    };
    const onPositionError = (error: GeolocationPositionError) => {
      if (disposed) return;
      disposed = true;
      if (error.code === 1) {
        stopForegroundGuidance("定位权限已拒绝，已停止连续定位和语音；你仍可查看路线并手动确认到点。", "denied");
      } else if (error.code === 3) {
        stopForegroundGuidance("连续定位等待超时，已停止监听和语音；再次尝试必须由你手动开启。", "timeout");
      } else {
        stopForegroundGuidance("当前位置暂不可用，已停止连续定位和语音；不会保留旧位置继续判断。", "error");
      }
    };
    const onVisibilityChange = () => {
      if (disposed) return;
      if (document.visibilityState !== "visible") {
        disposed = true;
        stopForegroundGuidance("页面已离开前台，连续定位和语音已停止；返回后不会自动重启。", "idle");
      }
    };

    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 5_000,
      });
      geolocationWatchRef.current = watchId;
      document.addEventListener("visibilitychange", onVisibilityChange);
    } catch {
      queueMicrotask(() => stopForegroundGuidance("连续定位无法启动，已保持关闭；请检查浏览器权限后手动重试。", "error"));
      return;
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (geolocationWatchRef.current === watchId) clearForegroundWatch();
    };
  }, [
    canStartDemo,
    clearForegroundWatch,
    current,
    demoMode,
    guideSession?.status,
    stopForegroundGuidance,
    trackingRequested,
  ]);

  function startForegroundGuidance() {
    const gate = {
      userEnabled: true,
      demoMode,
      canStartDemo,
      sessionStatus: guideSession?.status ?? "IDLE",
    } as const;
    if (!current || !shouldRunForegroundGuidance(gate)) {
      setLocationStatus("只有路线处于进行中时，才能手动开启前台连续定位。");
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocationQuality("unsupported");
      setLocationStatus("当前浏览器不支持连续定位；请查看路线列表和现场标识，并手动确认到点。");
      return;
    }
    cancelSpeech();
    approachTrackerRef.current = createForegroundApproachTracker(current.id);
    setGuidance(null);
    setAccuracy(null);
    setLocationQuality("requesting");
    setLocationStatus("正在等待前台定位样本；低精度、超时或页面转入后台都会立即停止。");
    setTrackingRequested(true);
  }

  function persistSession(nextSession: GuideSessionRecord, successMessage: string) {
    const write = writeGuideSession(nextSession);
    if (!write.ok) {
      setSessionNotice(`${write.error} 状态没有推进，请重试或继续查看只读路线。`);
      return false;
    }
    setGuideSession(nextSession);
    setSessionNotice(successMessage);
    return true;
  }

  function startSession() {
    if (!canStartDemo || !stops.length) return;
    const nextSession = createGuideSession(stops.map((stop) => stop.id), { planBinding: sessionPlanBinding });
    persistSession(nextSession, "演示已开始；进度只保存在这台设备。");
  }

  function changeSession() {
    if (!guideSession || guideSession.status === "COMPLETED") return;
    const event = guideSession.status === "PAUSED" ? { type: "RESUME" as const } : { type: "PAUSE" as const };
    const nextSession = transitionGuideSession(guideSession, event);
    if (nextSession.status === "PAUSED") {
      stopForegroundGuidance("演示已暂停，连续定位和语音已停止；恢复后不会自动重启。", "idle");
    }
    const persisted = persistSession(nextSession, nextSession.status === "PAUSED" ? "演示已暂停，刷新后可在本机恢复。" : "演示已恢复。");
    if (persisted && nextSession.status === "ACTIVE") {
      setLocationStatus("演示已恢复；前台连续定位仍保持关闭，需要你再次手动开启。");
    }
  }

  function endEarly() {
    if (!guideSession || guideSession.status === "COMPLETED") return;
    stopForegroundGuidance("本次演示已结束，连续定位和语音已停止。", "idle");
    const nextSession = transitionGuideSession(guideSession, { type: "END_EARLY" });
    if (persistSession(nextSession, "本次演示已提前结束；未经过的站点不会标记为完成。")) {
      setEndConfirming(false);
    }
  }

  function restartSession() {
    if (!guideSession || guideSession.status !== "COMPLETED") return;
    const nextSession = transitionGuideSession(guideSession, { type: "RESTART" });
    if (persistSession(nextSession, "已从第一站重新开始本次演示。")) {
      stopForegroundGuidance("已重新开始演示；连续定位不会自动开启。", "idle");
    }
  }

  function speakStory() {
    if (!current || muted || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(
      `${current.name}。${current.subtitle}。开放与通行规则可能变化，请以现场最新信息为准。`,
    );
    utterance.lang = "zh-CN";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function focusSiteHelp() {
    siteHelpRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    siteHelpRef.current?.focus({ preventScroll: true });
  }

  function speakDistance() {
    if (
      !current ||
      muted ||
      !trackingRequested ||
      locationQuality !== "reliable" ||
      !guidance ||
      guidance.distanceMeters === null ||
      !guidance?.roughDirection ||
      guideSession?.status !== "ACTIVE" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }
    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(buildForegroundDistanceAnnouncement({
      targetName: current.name,
      distanceMeters: guidance.distanceMeters,
      roughDirection: guidance.roughDirection,
    }));
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function markArrived() {
    if (!current || !guideSession || guideSession.status !== "ACTIVE") return;
    const now = new Date().toISOString();
    const stored = readJourneyData();
    if (stored.error) {
      setSessionNotice(`${stored.error} 到点状态没有推进，请重试。`);
      return;
    }
    const alreadyStamped = stored.data.stamps.some((stamp) => stamp.spotId === current.id);
    const stamps = alreadyStamped
      ? stored.data.stamps
      : [
          { id: createJourneyId("stamp"), spotId: current.id, spotName: current.name, note: "用户在前台导览中手动确认到达", stampedAt: now },
          ...stored.data.stamps,
        ];
    const stampMessage = alreadyStamped ? `${current.name}已有印章，本次不重复保存。` : `${current.name}印章已保存到本机。`;

    cancelSpeech();
    const nextSession = transitionGuideSession(guideSession, { type: "ARRIVE" }, new Date(now));
    const commit = commitGuideArrival({
      beforeJourney: stored.data,
      afterJourney: { ...stored.data, stamps, updatedAt: now },
      beforeSession: guideSession,
      afterSession: nextSession,
      spotId: current.id,
      now: new Date(now),
    });
    if (!commit.ok) {
      setSessionNotice(commit.error);
      return;
    }
    setGuideSession(nextSession);
    setSessionNotice(`${stampMessage} ${nextSession.status === "COMPLETED" ? "本次路线的所有站点均已手动确认。" : "已进入下一站。"}`);
    if (nextSession.status === "COMPLETED") {
      stopForegroundGuidance("所有地点均已由你手动确认，连续定位和语音已停止。", "idle");
    } else if (trackingRequested) {
      approachTrackerRef.current = createForegroundApproachTracker(nextSession.stopIds[nextSession.currentIndex]);
      setGuidance(null);
      setAccuracy(null);
      setLocationQuality("requesting");
      setLocationStatus("已进入下一站，正在等待新的前台定位信息。");
    }
  }

  if (planLoading || (canStartDemo && !sessionReady)) {
    return <div className="mx-auto max-w-3xl px-4 py-20"><div role="status" className="rounded-[2rem] border border-[#173f35]/10 bg-[#fffaf0] p-8 text-sm text-[#61736a]">正在读取路线与导览进度…</div></div>;
  }

  if (planError || !current) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20"><div role="alert" className="rounded-[2rem] border border-[#9b453c]/20 bg-[#fff6ed] p-8 text-sm leading-7 text-[#75524b]">
        <ShieldWarning className="mb-3 text-[#9b453c]" size={30} weight="duotone" /><strong className="block text-lg text-[#743f37]">路线快照校验失败，已阻止演示</strong>
        <p className="mt-2">{planError ?? "当前路线没有可载入的站点。"}</p><p className="mt-2">请返回路线规划页重新生成，避免继续使用已经变化的旧路线。</p>
        <Link href="/plan" className="mt-5 inline-flex rounded-full bg-[#173f35] px-5 py-3 text-xs font-medium text-white">返回路线规划</Link>
      </div></div>
    );
  }

  const directDistance = locationQuality === "reliable" ? guidance?.distanceMeters ?? null : null;
  const roughDirection = locationQuality === "reliable" ? guidance?.roughDirection ?? null : null;
  const maybeNearCandidate = guidance?.approachStatus === "maybe_near" && trackingRequested && session === "ACTIVE" && demoMode;
  const displayedNetworkDistance = next ? networkDistance : null;
  const completedEarly = guideSession?.status === "COMPLETED" && guideSession.endReason === "ended_early";
  const completedRoute = guideSession?.status === "COMPLETED" && guideSession.endReason === "route_completed";
  const statusLabel = !canStartDemo ? "路线暂不可开始" : session === "IDLE" ? "等待开始" : session === "ACTIVE" ? "导览进行中" : session === "PAUSED" ? "导览已暂停" : completedEarly ? "本次导览已提前结束" : "本次导览完成";

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section aria-label="手机现场操作" className="sticky top-2 z-40 rounded-[1.5rem] border border-[#173f35]/15 bg-[#fffaf0]/96 p-4 shadow-[0_16px_45px_rgba(23,63,53,.18)] backdrop-blur-xl lg:hidden">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#76551f]">现场操作</p><p className="mt-1 text-sm font-semibold">当前地点：{current.name}</p><span className="mt-2 inline-flex rounded-full bg-[#e7eee8] px-3 py-1.5 text-xs font-medium">现场：{statusLabel}</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {session === "IDLE" ? (
            canStartDemo ? <button type="button" onClick={startSession} aria-label="现场栏：开始演示导览" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#173f35] px-2 text-xs font-semibold text-white"><Play size={17} weight="fill" aria-hidden="true" />开始演示</button> : <a href="#public-road-navigation" aria-label="现场栏：打开高德真实导航" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#173f35] px-2 text-xs font-semibold text-white"><MapPin size={17} weight="fill" aria-hidden="true" />高德导航</a>
          ) : session === "COMPLETED" ? (
            <button type="button" onClick={restartSession} aria-label="现场栏：重新开始演示" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#173f35] px-2 text-xs font-semibold text-white"><Play size={17} aria-hidden="true" />重新开始</button>
          ) : (
            <button type="button" onClick={changeSession} aria-label={session === "PAUSED" ? "现场栏：恢复演示" : "现场栏：暂停演示"} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#173f35] px-2 text-xs font-semibold text-white">{session === "PAUSED" ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{session === "PAUSED" ? "恢复" : "暂停"}</button>
          )}
          <button type="button" onClick={markArrived} disabled={session !== "ACTIVE"} aria-label="现场栏：手动确认到达" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#d95a4a] px-2 text-xs font-semibold text-white disabled:bg-[#a9aaa5]"><Check size={17} weight="bold" aria-hidden="true" />确认到达</button>
          <button type="button" onClick={focusSiteHelp} aria-label="现场栏：查看现场求助" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-[#9b453c]/25 bg-[#fff6ed] px-2 text-xs font-semibold text-[#823e36]"><ShieldWarning size={17} weight="duotone" aria-hidden="true" />现场求助</button>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#52655c]">到点需要你在现场手动确认；遇到封闭、限制或疑似偏航时请立即停止并询问工作人员，网页不会自行生成未经核验的捷径。</p>
      </section>

      <section className="map-shell relative min-h-[55dvh] overflow-hidden rounded-[2rem] border border-[#173f35]/10 bg-[#e9eee5] shadow-[0_24px_70px_rgba(44,69,58,.12)] lg:min-h-[calc(100dvh-120px)]">
        <DetailedMapSurface variant="full" selectedSpotId={current.id} onSpotSelect={() => undefined} />
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/70 bg-[#fffaf0]/92 p-4 text-sm shadow-lg backdrop-blur-xl"><div className="flex items-center gap-2 font-semibold"><Warning size={18} weight="duotone" className="text-[#b66d40]" />高德公开道路与景区内部路网分层</div><p className="mt-1 text-xs leading-5 text-[#63736b]">高德底图和“开始导航”使用公开道路与 POI；景区内部路网在取得管理方发布、现场复走与动态开放状态前不会被本系统编造为可走路线。</p></div>
      </section>

      <aside className="rounded-[2rem] border border-[#173f35]/10 bg-[#fffaf0] p-5 shadow-[0_24px_70px_rgba(44,69,58,.12)] md:p-7">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.2em] text-[#76551f]">Live guide</span><button type="button" onClick={() => { setLocalMuted((currentMuted) => !currentMuted); cancelSpeech(); }} disabled={globalMuted} aria-label={globalMuted ? "全局静音已开启；请在显示与辅助设置中关闭" : localMuted ? "开启本页语音" : "静音并停止本页语音"} className="grid h-12 w-12 place-items-center rounded-full border border-[#173f35]/15 disabled:cursor-not-allowed disabled:opacity-55">{muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}</button></div>

        <PublicNavigationPanel destinationName={current.name} showTravelGroupControl={false} />

        {plan && <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl border border-[#173f35]/10 bg-white/55 p-4 text-xs leading-5"><div><dt className="text-[#768079]">路线版本</dt><dd>#{plan.revision}</dd></div><div><dt className="text-[#768079]">路线状态</dt><dd>{plan.validation.status}</dd></div><div><dt className="text-[#768079]">交通偏好</dt><dd>{plan.transport}</dd></div><div><dt className="text-[#768079]">待确认事项</dt><dd>{plan.unresolved.length}</dd></div></dl>}
        {!planId && <div role="note" className="mt-4 rounded-2xl border border-[#b88a43]/22 bg-[#f5ecdf] p-4 text-xs leading-5 text-[#675c49]"><strong className="block text-[#725929]">兼容路线</strong><p className="mt-1">这是一条较早保存的路线。为获得更完整的地点说明与行前核对，请从路线规划页重新生成。</p></div>}

        <div role="note" data-route-disruption-action={routeDisruptionDecision.action} data-route-disruption-code={routeDisruptionDecision.code} className="mt-4 rounded-2xl border border-[#9b453c]/22 bg-[#fff6ed] p-4 text-sm leading-6 text-[#684d47]"><strong className="block text-[#823e36]">路线异常与封闭 · 停止并核验</strong><p className="mt-1">{routeDisruptionDecision.message}</p><p className="mt-2 text-xs leading-5">处理原则：停止并核验（STOP_AND_VERIFY）；询问工作人员（ASK_STAFF）。{routeDisruptionDecision.safetyNotice}</p><button type="button" onClick={focusSiteHelp} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#9b453c]/25 bg-white/60 px-4 text-sm font-semibold text-[#823e36]">路线异常：查看现场求助</button></div>

        <div className="mt-5 flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${session === "ACTIVE" ? "bg-[#5e8a69]" : "bg-[#b9a992]"}`} /><span>{statusLabel}</span>{guideSession && <span className="ml-auto text-[#7a837e]">会话修订 {guideSession.revision}</span>}</div>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-.05em]">{completedEarly ? "演示已提前结束" : completedRoute ? "旅程完成" : current.name}</h1>
        {session !== "COMPLETED" && <p className="mt-3 text-sm leading-7 text-[#63746c]">{current.subtitle}</p>}

        {currentPlanStop && session !== "COMPLETED" && <dl className="mt-4 rounded-2xl bg-[#f5ecdf] p-4 text-xs leading-5 text-[#675c49]"><div><dt className="inline text-[#89745a]">原文证据：</dt><dd className="inline">{currentPlanStop.evidence}</dd></div><div><dt className="inline text-[#89745a]">识别置信：</dt><dd className="inline">{stopConfidenceLabel(currentPlanStop.confidence)}</dd></div><div><dt className="inline text-[#89745a]">建议停留：</dt><dd className="inline">{currentPlanStop.dwellMinutes === null ? "待确认" : `${currentPlanStop.dwellMinutes} 分钟`}</dd></div></dl>}

        {session === "IDLE" ? canStartDemo ? <button type="button" onClick={startSession} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-4 font-medium text-white"><Play size={18} weight="fill" />我已了解，仅开始演示导览</button> : <div role="alert" className="mt-7 rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed] p-5 text-sm leading-7 text-[#75524b]"><ShieldWarning className="mb-2 text-[#9b453c]" size={27} weight="duotone" /><strong className="block text-[#743f37]">景区内部线路尚未达到可执行标准</strong><p className="mt-2">内部入口、步道与运营状态仍待管理方发布及现场复走，因此系统不会虚构景区内导航。你现在可以先使用已加载的高德公开道路导航前往公开 POI / 入口。</p><a href="#public-road-navigation" className="mt-4 inline-flex rounded-full bg-[#173f35] px-4 py-2.5 text-xs font-medium text-white">使用高德真实道路导航</a><Link href="/plan" className="mt-3 inline-flex px-1 text-xs font-medium text-[#725929] underline underline-offset-4">查看路线规划与核验状态</Link></div> : session === "COMPLETED" ? <div className="mt-7 rounded-2xl bg-[#e7eee8] p-5 text-sm leading-7"><Check className="mb-2 text-[#5d7d65]" size={28} weight="bold" />{completedEarly ? "本次演示已提前结束，不代表路线完成；未经过的站点没有自动到点或打卡。" : "本次演示路线的所有站点均由你手动确认。已成功保存的个人印章可以在“我的旅程”查看。"}<button type="button" onClick={restartSession} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-4 py-3 text-sm"><Play size={17} />重新开始此演示</button></div> : <>
          <div role="note" className="mt-6 rounded-2xl border border-[#b88a43]/22 bg-[#f5ecdf] p-4 text-xs leading-5 text-[#675c49]"><strong className="block text-[#725929]">前台距离提示</strong><p className="mt-1">只有你明确开启且页面保持前台时才持续读取位置。它只提供粗略方位，不播报转弯或预计到达时间，也不会自动推进或打卡。</p></div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#f1e8da] p-4"><span className="text-xs text-[#7c756a]">到下一站的直线距离</span><strong className="mt-1 block text-xl">{locationQuality === "low" ? "精度不足" : directDistance === null ? trackingRequested ? "等待定位" : "未开启" : formatForegroundDistance(directDistance)}</strong></div>
            <div className="rounded-2xl bg-[#e7eee8] p-4"><span className="text-xs text-[#65756e]">下一站粗略方位</span><strong className="mt-1 block text-xl">{roughDirection ? roughDirection === "当前位置附近" ? "位置大致重合" : `${roughDirection}侧` : "等待可靠定位"}</strong></div>
          </div>
          {maybeNearCandidate && <div role="status" aria-live="polite" className="mt-3 rounded-2xl border border-[#5e8a69]/25 bg-[#e7eee8] p-4 text-xs leading-5 text-[#496255]"><strong className="block text-sm">可能已接近“{current.name}”</strong><p className="mt-1">这只表示多个可靠定位样本持续落在保守直线半径内，不等于已经到达。系统不会自动打卡；请核对现场标识后再手动确认。</p></div>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => trackingRequested ? stopForegroundGuidance("你已停止前台连续定位和语音；再次使用需要手动开启。", "idle") : startForegroundGuidance()} disabled={session !== "ACTIVE"} aria-pressed={trackingRequested} className="rounded-xl border border-[#173f35]/14 px-3 py-3 text-sm disabled:opacity-45"><MapPin className="mr-1.5 inline" size={17} />{trackingRequested ? "停止连续定位" : session === "PAUSED" ? "暂停时定位关闭" : "开启连续定位"}</button>
            <button type="button" onClick={cancelSpeech} className="rounded-xl border border-[#173f35]/14 px-3 py-3 text-sm"><SpeakerSlash className="mr-1.5 inline" size={17} />停止当前播报</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#758179]" role="status" aria-live="polite">{locationStatus}{accuracy !== null ? ` · 浏览器报告精度约 ${Math.round(accuracy)} 米` : ""}</p>
          <p className="mt-2 text-[11px] leading-5 text-[#88725b]">页面转入后台、定位精度不足、权限拒绝、等待超时、暂停或结束时，监听与语音都会停止；刷新恢复进度也不会自动重启定位。</p>
          <div className="mt-3 rounded-2xl bg-[#eef1eb] p-4"><span className="text-xs text-[#65756e]">当前地点至后续地点的参考距离</span><strong className="mt-1 block text-base">{displayedNetworkDistance === null ? "待核对" : `约 ${(displayedNetworkDistance / 1000).toFixed(1)} 公里`}</strong><p className="mt-1 text-[11px] leading-5 text-[#758179]">这不是从当前位置出发的导航距离，实际通行请以现场为准。</p></div>
          <div className="mt-6 flex gap-2"><button type="button" onClick={changeSession} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-4 py-3 text-sm">{session === "PAUSED" ? <Play size={17} /> : <Pause size={17} />}{session === "PAUSED" ? "恢复" : "暂停"}</button><button type="button" onClick={() => setEndConfirming(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-4 py-3 text-sm"><Stop size={17} />提前结束演示</button></div>
          {endConfirming && <div role="alert" className="mt-3 rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed] p-4 text-xs leading-5 text-[#75524b]"><strong className="block">确认提前结束？</strong><p className="mt-1">这会记录为“已提前结束”，不会伪装成完成整条路线。</p><div className="mt-3 flex gap-2"><button type="button" onClick={endEarly} className="rounded-full bg-[#9b453c] px-4 py-2 text-white">确认提前结束</button><button type="button" onClick={() => setEndConfirming(false)} className="rounded-full border border-[#173f35]/15 px-4 py-2">继续演示</button></div></div>}
          <button type="button" onClick={speakDistance} disabled={muted || session !== "ACTIVE" || !trackingRequested || locationQuality !== "reliable" || directDistance === null || !roughDirection} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#b88a43]/35 px-5 py-3.5 text-sm font-medium text-[#7b5f2f] disabled:opacity-40"><SpeakerHigh size={18} />播报粗略距离与方位</button>
          <button type="button" onClick={speakStory} disabled={muted || session === "PAUSED"} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#b88a43] px-5 py-3.5 text-sm font-medium text-white disabled:opacity-40"><Headphones size={18} />播放文字讲解</button>
          <button type="button" onClick={markArrived} disabled={session === "PAUSED"} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#d95a4a] px-5 py-4 font-medium text-white disabled:opacity-40"><Check size={18} weight="bold" />我已现场确认到达（手动）</button>
        </>}
        {sessionNotice && <p role="status" className="mt-3 rounded-xl border border-[#b88a43]/18 bg-[#f5ecdf] p-3 text-xs leading-5 text-[#675c49]">{sessionNotice}</p>}

        <div className="mt-7 border-t border-[#173f35]/10 pt-5"><h2 className="text-sm font-semibold">等价路线列表</h2><ol className="mt-3 space-y-3">{stops.map((spot, index) => { const plannedStop = planStopById.get(spot.id); return <li key={spot.id} className={`flex items-start gap-3 text-sm ${index < currentIndex ? "text-[#77907f]" : ""}`}><span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${index <= currentIndex ? "bg-[#173f35] text-white" : "bg-[#e5e4dc]"}`}>{index < currentIndex ? <Check size={13} /> : index + 1}</span><span><span className="block">{spot.name}</span>{plannedStop && <span className="mt-1 block text-[11px] leading-4 text-[#758179]">证据“{plannedStop.evidence}” · {stopConfidenceLabel(plannedStop.confidence)} · 停留 {plannedStop.dwellMinutes === null ? "待确认" : `${plannedStop.dwellMinutes} 分钟`}</span>}</span></li>; })}</ol></div>
        <div ref={siteHelpRef} id="on-site-help" tabIndex={-1} role="region" aria-labelledby="on-site-help-title" className="mt-7 scroll-mt-24 rounded-2xl border border-[#d95a4a]/25 bg-[#fff6ed] p-4 outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#9b453c]"><div id="on-site-help-title" className="flex items-center gap-2 text-sm font-semibold text-[#823e36]"><ShieldWarning size={19} weight="duotone" aria-hidden="true" />现场求助</div><p className="mt-2 text-sm leading-6 text-[#684d47]">优先联系现场工作人员，并以现场标识和管理要求为准。请勿只依赖网页判断安全路线。</p><div className="mt-3 rounded-xl border border-[#9b453c]/15 bg-white/55 p-3"><p className="text-xs font-semibold text-[#684d47]">全国通用紧急服务 · 不是景区专线</p><div className="mt-2 grid grid-cols-2 gap-2"><a href="tel:110" aria-label="拨打全国通用报警电话 110" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9b453c]/20 bg-white px-3 text-sm font-semibold text-[#823e36]">人身危险 · 110</a><a href="tel:120" aria-label="拨打全国通用医疗急救电话 120" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#9b453c]/20 bg-white px-3 text-sm font-semibold text-[#823e36]">医疗急救 · 120</a></div></div></div>
        <Link href={`/guide/ask?spot=${current.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm font-medium">继续向禅小荔提问</Link>
        <Link href="/journey" className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#173f35]/15 px-5 py-3.5 text-sm font-medium">查看我的路线、印章与游记</Link>
      </aside>
    </div>
  );
}
