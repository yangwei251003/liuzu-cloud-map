"use client";

import {
  CheckCircle,
  Crosshair,
  Footprints,
  NavigationArrow,
  Path,
  Pause,
  Play,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormalAlongRouteRecommendations } from "@/components/FormalAlongRouteRecommendations";
import { FormalNavigationMap, type FormalNavigationMapPosition } from "@/components/FormalNavigationMap";
import { OfflinePackControl } from "@/components/OfflinePackControl";
import { SmartScenicItineraryPlanner } from "@/components/SmartScenicItineraryPlanner";
import { TravelGroupNavigator, type TravelGroupMapMember } from "@/components/TravelGroupNavigator";
import {
  ACCESSIBILITY_PREFERENCES_EVENT,
  ACCESSIBILITY_PREFERENCES_KEY,
  PROJECT_DATA_CLEARED_EVENT,
  readAccessibilityPreferences,
} from "@/lib/accessibility-preferences";
import {
  PEDESTRIAN_ROUTE_TRAVERSAL_MODES,
  planDirectedRoute,
  type DirectedRouteOptimization,
  type DirectedRoutePlan,
  type DirectedRoutePreference,
} from "@/lib/directed-route-engine";
import {
  readInstalledFormalOfflineMapBundle,
  readInstalledFormalRoutingSnapshot,
  type InstalledFormalOfflineMapBundle,
  type InstalledFormalRoutingSnapshot,
} from "@/lib/formal-offline-pack-client";
import {
  createFormalNavigationPageLifecycleState,
  formalNavigationPageLifecycleBlocksActivation,
  formalNavigationPageLifecycleLabel,
  transitionFormalNavigationPageLifecycle,
  type FormalNavigationPageLifecycleEvent,
} from "@/lib/formal-navigation-page-lifecycle";
import {
  advanceFormalNavigation,
  createFormalNavigationRuntime,
  FORMAL_NAVIGATION_MAX_ACCURACY_METERS,
  FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS,
  prepareFormalNavigationTrackerForResume,
  transitionFormalNavigation,
  type FormalNavigationLocationSample,
  type FormalNavigationRouteMatch,
  type FormalNavigationRuntime,
  type FormalNavigationTracker,
} from "@/lib/formal-navigation-runtime";
import { matchLocationToFormalNode } from "@/lib/formal-location-match";
import {
  decideGeolocationPermissionTransition,
  geolocationPermissionBlocksActivation,
  type GeolocationPermissionState,
} from "@/lib/geolocation-session-policy";
import {
  buildFormalNavigationRerouteIntent,
  type FormalNavigationRerouteReason,
} from "@/lib/formal-navigation-reroute";
import {
  createFormalNavigationVoiceTracker,
  decideFormalNavigationVoice,
  formalNavigationVoiceLegKey,
  type FormalNavigationVoiceAction,
} from "@/lib/formal-navigation-voice";
import { useNavigationSessionSync } from "@/lib/use-navigation-session-sync";
import {
  evaluateDeterministicRouteOperationalReplan,
  evaluateRouteOperationalMonitor,
  ROUTE_OPERATION_MONITOR_INTERVAL_MS,
  type RouteOperationalMonitorDecision,
} from "@/lib/route-operation-monitor";

type FormalNode = {
  id: string;
  type: "ENTRANCE_CONNECTOR" | "JUNCTION" | "DESTINATION" | "FACILITY" | "TRANSIT";
  displayName?: string;
  poiId?: string | null;
  coordinate: { longitude: number; latitude: number };
  visit?: {
    interestTags: Array<"HISTORY" | "CULTURE" | "NATURE" | "PHOTOGRAPHY" | "FAMILY" | "REST">;
    dwellMinutes: number;
    editorialPriority: number;
    familyFriendly: boolean;
    restArea: boolean;
    photoSpot: boolean;
    evidenceReference: string;
  };
};

type FormalEntrance = {
  publicNodeId: string;
  internalNodeId: string;
};

type FormalRecommendedRoute = {
  id: string;
  name: string;
  originNodeId: string;
  destinationNodeId: string;
  segments: Array<{ edgeId: string; traversalDirection: "FORWARD" | "REVERSE" }>;
  traversalModes: Array<"WALKWAY" | "BOARDWALK" | "MOUNTAIN_TRAIL" | "STAIRS" | "CABLEWAY" | "SHUTTLE">;
  distanceMeters: number;
  estimatedMinutes: number;
  sourceReference: string;
};

type FormalSnapshot = {
  networkRevision: string;
  operationalVersion: number;
  expiresAt: string;
  routeNetwork: {
    nodes: FormalNode[];
    entrances: FormalEntrance[];
    recommendedRoutes?: FormalRecommendedRoute[];
  };
};

type PlannerPhase = "loading" | "ready" | "unavailable" | "error";
type SnapshotTransport = "ONLINE" | "OFFLINE_PACK";
type AutomaticRerouteTrigger = { sequence: number; reason: FormalNavigationRerouteReason };
type AutomaticRerouteState = "IDLE" | "LOCATING" | "REFRESHING" | "PLANNING" | "FAILED";
type NavigationVoiceState = "OFF" | "READY" | "SPEAKING" | "UNSUPPORTED" | "FAILED";

const MANEUVER_LABELS = {
  STRAIGHT: "继续直行",
  LEFT: "前方左转",
  RIGHT: "前方右转",
  U_TURN: "前方掉头",
  BOARD_CABLEWAY: "前往索道乘坐点",
  RIDE_CABLEWAY: "正在乘坐索道",
  ALIGHT_CABLEWAY: "索道即将到站",
  BOARD_SHUTTLE: "前往观光车乘坐点",
  RIDE_SHUTTLE: "正在乘坐观光车",
  ALIGHT_SHUTTLE: "观光车即将到站",
  ARRIVE: "即将到达",
} as const;

const GUIDANCE_LABELS = {
  WAITING: "等待可靠定位",
  RELIABLE: "定位可靠",
  LOW_ACCURACY: "定位精度不足",
  STALE: "定位或路线已过期",
  JUMP: "检测到定位跳点",
  INVALID: "定位不可用",
  OFF_ROUTE: "已确认偏航",
  WRONG_WAY: "已确认反向行走",
  ARRIVED: "已确认到达",
  PAUSED: "导航已暂停",
} as const;

const NOTICE_LABELS: Record<string, string> = {
  STAIRS_PRESENT: "路线包含台阶",
  ACCESSIBILITY_UNVERIFIED: "部分无障碍信息仍需核验",
  SLOPE_UNVERIFIED: "部分坡度信息仍需核验",
  WIDTH_UNVERIFIED: "部分路宽信息仍需核验",
  LIGHTING_UNVERIFIED: "部分照明信息仍需核验",
  DYNAMIC_TIME_UNVERIFIED: "部分动态耗时因素未发布",
  DYNAMIC_TRAVEL_TIME_APPLIED: "预计耗时已应用经复核的短时动态倍率",
  CROWD_FACTOR_APPLIED: "路线已应用经复核的客流等级",
  WEATHER_FACTOR_APPLIED: "路线已应用经复核的天气影响",
  CABLEWAY_INCLUDED: "路线包含已发布索道段",
  SHUTTLE_INCLUDED: "路线包含已发布观光车段",
  TRANSPORT_WAIT_INCLUDED: "总耗时包含已发布登乘与预计候乘时间",
};

const CROWD_FACTOR_LABELS = { LOW: "低", MODERATE: "中等", HIGH: "高", UNKNOWN: "未发布" } as const;
const WEATHER_FACTOR_LABELS = { NONE: "无", RAIN: "降雨", HEAT: "高温", WIND: "大风", MULTIPLE: "多重影响", UNKNOWN: "未发布" } as const;

const STRATEGIES: Array<{ value: DirectedRouteOptimization; label: string; description: string }> = [
  { value: "FASTEST", label: "最快", description: "使用当前已发布耗时因子" },
  { value: "SHORTEST", label: "最短", description: "以可走距离为首要目标" },
  { value: "SCENIC", label: "观光", description: "使用已审核观光评分与难度" },
];

function isSnapshot(value: unknown): value is FormalSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<FormalSnapshot>;
  if (!(
    typeof snapshot.networkRevision === "string"
    && Number.isSafeInteger(snapshot.operationalVersion)
    && typeof snapshot.expiresAt === "string"
    && typeof snapshot.routeNetwork === "object"
    && snapshot.routeNetwork !== null
    && Array.isArray(snapshot.routeNetwork.nodes)
    && Array.isArray(snapshot.routeNetwork.entrances)
  )) return false;
  const nodeTypes = new Set(["ENTRANCE_CONNECTOR", "JUNCTION", "DESTINATION", "FACILITY", "TRANSIT"]);
  const nodesValid = snapshot.routeNetwork.nodes.every((node) => (
    typeof node === "object"
    && node !== null
    && typeof (node as FormalNode).id === "string"
    && nodeTypes.has((node as FormalNode).type)
    && typeof (node as FormalNode).coordinate === "object"
    && (node as FormalNode).coordinate !== null
    && Number.isFinite((node as FormalNode).coordinate.latitude)
    && Number.isFinite((node as FormalNode).coordinate.longitude)
    && ((node as FormalNode).displayName === undefined || typeof (node as FormalNode).displayName === "string")
    && ((node as FormalNode).poiId === undefined || (node as FormalNode).poiId === null || (typeof (node as FormalNode).poiId === "string" && /^[a-z0-9][a-z0-9_-]{1,79}$/.test((node as FormalNode).poiId!)))
    && ((node as FormalNode).visit === undefined || (
      Array.isArray((node as FormalNode).visit?.interestTags)
      && (node as FormalNode).visit!.interestTags.length > 0
      && (node as FormalNode).visit!.interestTags.length <= 6
      && (node as FormalNode).visit!.interestTags.every((interest) => ["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"].includes(interest))
      && new Set((node as FormalNode).visit!.interestTags).size === (node as FormalNode).visit!.interestTags.length
      && Number.isInteger((node as FormalNode).visit!.dwellMinutes)
      && (node as FormalNode).visit!.dwellMinutes >= 5
      && (node as FormalNode).visit!.dwellMinutes <= 180
      && Number.isInteger((node as FormalNode).visit!.editorialPriority)
      && (node as FormalNode).visit!.editorialPriority >= 0
      && (node as FormalNode).visit!.editorialPriority <= 100
      && typeof (node as FormalNode).visit!.familyFriendly === "boolean"
      && typeof (node as FormalNode).visit!.restArea === "boolean"
      && typeof (node as FormalNode).visit!.photoSpot === "boolean"
      && typeof (node as FormalNode).visit!.evidenceReference === "string"
      && Boolean((node as FormalNode).visit!.evidenceReference.trim())
    ))
  ));
  const entrancesValid = snapshot.routeNetwork.entrances.every((entrance) => (
    typeof entrance === "object"
    && entrance !== null
    && typeof (entrance as FormalEntrance).publicNodeId === "string"
    && typeof (entrance as FormalEntrance).internalNodeId === "string"
  ));
  const recommendedRoutes = snapshot.routeNetwork.recommendedRoutes;
  const recommendedRoutesValid = recommendedRoutes === undefined || (
    Array.isArray(recommendedRoutes)
    && recommendedRoutes.length <= 200
    && recommendedRoutes.every((route) => (
      typeof route === "object"
      && route !== null
      && typeof route.id === "string"
      && typeof route.name === "string"
      && typeof route.originNodeId === "string"
      && typeof route.destinationNodeId === "string"
      && Array.isArray(route.segments)
      && route.segments.length > 0
      && route.segments.every((segment) => typeof segment?.edgeId === "string" && (segment.traversalDirection === "FORWARD" || segment.traversalDirection === "REVERSE"))
      && Array.isArray(route.traversalModes)
      && route.traversalModes.length > 0
      && route.traversalModes.every((mode) => ["WALKWAY", "BOARDWALK", "MOUNTAIN_TRAIL", "STAIRS", "CABLEWAY", "SHUTTLE"].includes(mode))
      && Number.isFinite(route.distanceMeters)
      && route.distanceMeters > 0
      && Number.isFinite(route.estimatedMinutes)
      && route.estimatedMinutes > 0
      && typeof route.sourceReference === "string"
    ))
  );
  return nodesValid && entrancesValid && recommendedRoutesValid;
}

function isRoutePlan(value: unknown): value is DirectedRoutePlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Partial<DirectedRoutePlan>;
  return (
    plan.schemaVersion === 1
    && typeof plan.routeFingerprint === "string"
    && /^drp1-[0-9a-f]{8}$/.test(plan.routeFingerprint)
    && typeof plan.networkRevision === "string"
    && typeof plan.scenicAreaId === "string"
    && typeof plan.originNodeId === "string"
    && typeof plan.destinationNodeId === "string"
    && (plan.optimization === "FASTEST" || plan.optimization === "SHORTEST" || plan.optimization === "SCENIC")
    && (plan.recommendedRouteId === undefined || (typeof plan.recommendedRouteId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.recommendedRouteId)))
    && Number.isSafeInteger(plan.operationalVersion)
    && Number.isFinite(plan.distanceMeters)
    && (plan.distanceMeters as number) >= 0
    && Number.isFinite(plan.estimatedMinutes)
    && (plan.estimatedMinutes as number) >= 0
    && typeof plan.dynamicFactorsApplied === "boolean"
    && Array.isArray(plan.traversals)
    && Array.isArray(plan.edgeIds)
    && plan.edgeIds.every((edgeId) => typeof edgeId === "string")
    && Array.isArray(plan.notices)
    && plan.notices.every((notice) => typeof notice === "string")
    && typeof plan.geometry === "object"
    && plan.geometry !== null
    && plan.geometry.type === "LineString"
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
    ))
    && typeof plan.expiresAt === "string"
  );
}

function nodeLabel(node: FormalNode) {
  if (node.displayName) return node.displayName;
  const typeLabel = node.type === "DESTINATION" ? "目的地" : node.type === "FACILITY" ? "设施" : "路网节点";
  return `${typeLabel} · ${node.id}`;
}

function errorMessage(value: unknown, fallback: string) {
  if (typeof value !== "object" || value === null) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function formalSnapshotFromEnvelope(value: unknown): FormalSnapshot | null {
  const candidate = typeof value === "object" && value !== null && "snapshot" in value
    ? (value as { snapshot?: unknown }).snapshot
    : value;
  return isSnapshot(candidate) ? candidate : null;
}

function monitorRouteBinding(plan: DirectedRoutePlan) {
  return {
    schemaVersion: 1 as const,
    routeId: plan.routeFingerprint,
    scenicAreaId: plan.scenicAreaId,
    networkRevision: plan.networkRevision,
    operationalVersion: plan.operationalVersion,
    expiresAt: plan.expiresAt,
  };
}

function automaticRerouteFailureMessage(code: string) {
  if (code === "LOCATION_STALE") return "没有取得 10 秒内的新鲜定位，自动重算已停止。请移动到开阔处后重试。";
  if (code === "LOCATION_LOW_ACCURACY") return "定位精度超过 35 米安全门限，自动重算已停止。请移动到开阔处后重试。";
  if (code === "NO_FORMAL_NODE_NEARBY") return "当前位置无法可靠匹配到正式路网节点，旧指令保持停止；请按现场标识行动或向工作人员求助。";
  if (code === "DESTINATION_UNAVAILABLE") return "原目的地已不属于当前正式路网，旧指令保持停止；请重新选择目的地。";
  if (code === "DESTINATION_REACHED") return "当前位置已匹配到目的节点附近，但未满足连续到达确认；请核对现场标识。";
  if (code === "VERSION_NOT_CHANGED") return "当前正式版本与旧路线一致，没有可验证的版本替换；旧指令保持停止。";
  if (code === "OFF_ROUTE_VERSION_DRIFT") return "重算期间运营版本发生变化，已拒绝使用混合版本；请重新重试。";
  return "自动重算未能形成可验证的新路线，旧指令保持停止；请按现场标识行动并向工作人员求助。";
}

function emptyNavigationTracker(): FormalNavigationTracker {
  return {
    previousAcceptedSample: null,
    routeProgressMeters: null,
    routeGeometryMeters: null,
    routeMatch: null,
    furthestRouteProgressMeters: null,
    progressJumpSamples: 0,
    wrongWaySamples: 0,
    outsideSamples: 0,
    arrivalSamples: 0,
    arrivalFirstSampleAtMs: null,
  };
}

function formatRemainingDistance(distanceMeters: number) {
  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${Math.max(0, Math.ceil(distanceMeters))} m`;
}

export function FormalNavigationPlanner({ scenicAreaId }: { scenicAreaId: string }) {
  const [phase, setPhase] = useState<PlannerPhase>("loading");
  const [snapshot, setSnapshot] = useState<FormalSnapshot | null>(null);
  const [snapshotTransport, setSnapshotTransport] = useState<SnapshotTransport | null>(null);
  const [offlineMapBundle, setOfflineMapBundle] = useState<InstalledFormalOfflineMapBundle | null>(null);
  const [message, setMessage] = useState("正在核验正式路网与运营状态…");
  const [originNodeId, setOriginNodeId] = useState("");
  const [destinationNodeId, setDestinationNodeId] = useState("");
  const [optimization, setOptimization] = useState<DirectedRouteOptimization>("FASTEST");
  const [recommendedRouteId, setRecommendedRouteId] = useState("");
  const [stepFree, setStepFree] = useState(false);
  const [allowCableway, setAllowCableway] = useState(false);
  const [allowShuttle, setAllowShuttle] = useState(false);
  const [pace, setPace] = useState<DirectedRoutePreference["pace"]>("BALANCED");
  const [maximumDifficulty, setMaximumDifficulty] = useState<DirectedRoutePreference["maximumDifficulty"]>("HARD");
  const [locating, setLocating] = useState(false);
  const [locationPermission, setLocationPermissionState] = useState<GeolocationPermissionState>("CHECKING");
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<DirectedRoutePlan | null>(null);
  const [plannerMessage, setPlannerMessage] = useState("");
  const [navigationRuntime, setNavigationRuntime] = useState<FormalNavigationRuntime | null>(null);
  const [livePosition, setLivePosition] = useState<FormalNavigationMapPosition | null>(null);
  const [routeMatch, setRouteMatch] = useState<FormalNavigationRouteMatch | null>(null);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [automaticRerouteState, setAutomaticRerouteState] = useState<AutomaticRerouteState>("IDLE");
  const [automaticRerouteTrigger, setAutomaticRerouteTrigger] = useState<AutomaticRerouteTrigger | null>(null);
  const [travelGroupMembers, setTravelGroupMembers] = useState<TravelGroupMapMember[]>([]);
  const [pageLifecycleState, setPageLifecycleState] = useState(() => createFormalNavigationPageLifecycleState());
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [globalSpeechMuted, setGlobalSpeechMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<NavigationVoiceState>("OFF");
  const [voiceMessage, setVoiceMessage] = useState("语音默认关闭；开启后只播报当前正式路线的前台关键指令。");
  const pageLifecycleStateRef = useRef(createFormalNavigationPageLifecycleState());
  const locationPermissionRef = useRef<GeolocationPermissionState>("CHECKING");
  const locationRequestSequenceRef = useRef(0);
  const runtimeRef = useRef<FormalNavigationRuntime | null>(null);
  const planRef = useRef<DirectedRoutePlan | null>(null);
  const trackerRef = useRef<FormalNavigationTracker>(emptyNavigationTracker());
  const latestNavigationSampleRef = useRef<FormalNavigationLocationSample | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const locationWatchSequenceRef = useRef(0);
  const rerouteSequenceRef = useRef(0);
  const rerouteAttemptedSequenceRef = useRef(0);
  const lastRerouteReasonRef = useRef<FormalNavigationRerouteReason>("OFF_ROUTE");
  const autoLocatedRevisionRef = useRef<string | null>(null);
  const offlineSnapshotRef = useRef<InstalledFormalRoutingSnapshot | null>(null);
  const offlinePlanPackRef = useRef<{ packId: string; packRevision: number; snapshotRevision: number } | null>(null);
  const planTransportRef = useRef<SnapshotTransport | null>(null);
  const voiceTrackerRef = useRef(createFormalNavigationVoiceTracker());
  const voiceSequenceRef = useRef(0);
  const voiceOwnsPlaybackRef = useRef(false);
  const {
    state: navigationHistoryState,
    startOrResume: syncNavigationStartOrResume,
    pause: syncNavigationPause,
    requireReroute: syncNavigationRequireReroute,
    arrive: syncNavigationArrive,
    cancel: syncNavigationCancel,
  } = useNavigationSessionSync();

  const applyPageLifecycleEvent = useCallback((event: FormalNavigationPageLifecycleEvent) => {
    const result = transitionFormalNavigationPageLifecycle(pageLifecycleStateRef.current, event);
    pageLifecycleStateRef.current = result.state;
    setPageLifecycleState(result.state);
    return result;
  }, []);

  const commitRuntime = useCallback((nextRuntime: FormalNavigationRuntime | null) => {
    runtimeRef.current = nextRuntime;
    setNavigationRuntime(nextRuntime);
  }, []);

  const commitLocationPermission = useCallback((state: GeolocationPermissionState) => {
    locationPermissionRef.current = state;
    setLocationPermissionState(state);
  }, []);

  const stopVoicePlayback = useCallback((resetTracker = true) => {
    voiceSequenceRef.current += 1;
    if (
      voiceOwnsPlaybackRef.current
      && typeof window !== "undefined"
      && "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
    }
    voiceOwnsPlaybackRef.current = false;
    if (resetTracker) voiceTrackerRef.current = createFormalNavigationVoiceTracker();
  }, []);

  const speakVoiceAction = useCallback((action: Extract<FormalNavigationVoiceAction, { type: "SPEAK" }>) => {
    if (
      typeof window === "undefined"
      || !("speechSynthesis" in window)
      || !("SpeechSynthesisUtterance" in window)
    ) {
      setVoiceEnabled(false);
      setVoiceState("UNSUPPORTED");
      setVoiceMessage("当前浏览器不支持前台语音；文字、地图与方向提示仍可继续使用。");
      return;
    }
    const speech = window.speechSynthesis;
    const sequence = voiceSequenceRef.current + 1;
    voiceSequenceRef.current = sequence;
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(action.text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    const chineseVoice = speech.getVoices().find((voice) => /^zh(?:-|_)/i.test(voice.lang));
    if (chineseVoice) utterance.voice = chineseVoice;
    utterance.onstart = () => {
      if (voiceSequenceRef.current !== sequence) return;
      setVoiceState("SPEAKING");
    };
    utterance.onend = () => {
      if (voiceSequenceRef.current !== sequence) return;
      voiceOwnsPlaybackRef.current = false;
      setVoiceState("READY");
      setVoiceMessage("语音已开启；等待下一条由当前正式路线生成的关键提示。");
    };
    utterance.onerror = (event) => {
      if (voiceSequenceRef.current !== sequence) return;
      voiceOwnsPlaybackRef.current = false;
      if (event.error === "canceled" || event.error === "interrupted") {
        setVoiceState("READY");
        setVoiceMessage("语音被浏览器或系统中断；文字、地图与方向提示仍可继续使用。");
        return;
      }
      setVoiceState("FAILED");
      setVoiceMessage("浏览器语音播放失败；导航仍以文字、地图和现场标识为准，可关闭后重试。");
    };
    setVoiceState("SPEAKING");
    setVoiceMessage(action.category === "MANEUVER"
      ? "正在播报当前正式路线的下一步指令。"
      : action.category === "ARRIVAL"
        ? "正在播报到达核对提示。"
        : "正在播报导航停止或安全提示。",
    );
    try {
      voiceOwnsPlaybackRef.current = true;
      speech.speak(utterance);
    } catch {
      voiceOwnsPlaybackRef.current = false;
      setVoiceState("FAILED");
      setVoiceMessage("浏览器语音播放失败；导航仍以文字、地图和现场标识为准，可关闭后重试。");
    }
  }, []);

  const runVoiceDecision = useCallback((enabled = voiceEnabled) => {
    const decision = decideFormalNavigationVoice(voiceTrackerRef.current, {
      enabled,
      globallyMuted: globalSpeechMuted,
      foreground: typeof document !== "undefined"
        && document.visibilityState === "visible"
        && pageLifecycleStateRef.current.phase === "FOREGROUND",
      runtime: runtimeRef.current,
      routeLegKey: formalNavigationVoiceLegKey(planRef.current, trackerRef.current.routeMatch),
      nowMs: Date.now(),
    });
    voiceTrackerRef.current = decision.tracker;
    if (decision.action.type === "SPEAK") {
      speakVoiceAction(decision.action);
    } else if (decision.action.type === "CANCEL") {
      stopVoicePlayback(false);
      setVoiceState(enabled && !globalSpeechMuted ? "READY" : "OFF");
      setVoiceMessage(globalSpeechMuted
        ? "全局静音已开启；导航语音保持关闭。"
        : enabled
          ? `${decision.action.reason}，当前语音已停止。`
          : "语音默认关闭；开启后只播报当前正式路线的前台关键指令。",
      );
    }
  }, [globalSpeechMuted, speakVoiceAction, stopVoicePlayback, voiceEnabled]);

  const scheduleAutomaticReroute = useCallback((reason: FormalNavigationRerouteReason) => {
    lastRerouteReasonRef.current = reason;
    rerouteSequenceRef.current += 1;
    setAutomaticRerouteState("IDLE");
    setAutomaticRerouteTrigger({ sequence: rerouteSequenceRef.current, reason });
  }, []);

  const stopLocationWatch = useCallback(() => {
    locationWatchSequenceRef.current += 1;
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const discardCurrentPlan = useCallback(() => {
    locationRequestSequenceRef.current += 1;
    setLocating(false);
    stopLocationWatch();
    stopVoicePlayback();
    const current = runtimeRef.current;
    if (current && (current.status === "ACTIVE" || current.status === "PAUSED")) {
      syncNavigationCancel(current.remainingDistanceMeters);
    }
    planRef.current = null;
    planTransportRef.current = null;
    offlinePlanPackRef.current = null;
    trackerRef.current = emptyNavigationTracker();
    latestNavigationSampleRef.current = null;
    setAutomaticRerouteState("IDLE");
    setAutomaticRerouteTrigger(null);
    setLivePosition(null);
    setRouteMatch(null);
    applyPageLifecycleEvent({ type: "RESET" });
    commitRuntime(null);
    setPlan(null);
  }, [applyPageLifecycleEvent, commitRuntime, stopLocationWatch, stopVoicePlayback, syncNavigationCancel]);

  const suspendForLocationPermission = useCallback((state: "DENIED" | "PROMPT") => {
    locationRequestSequenceRef.current += 1;
    autoLocatedRevisionRef.current = null;
    setLocating(false);
    stopLocationWatch();
    stopVoicePlayback();
    latestNavigationSampleRef.current = null;
    setLivePosition(null);
    const message = state === "DENIED"
      ? "定位权限已撤回，导航已立即暂停；旧位置与方向已清除，系统不会自动恢复。"
      : "定位权限需要重新确认，导航已立即暂停；请在前台主动恢复并重新授权。";
    const current = runtimeRef.current;
    if (current?.status === "ACTIVE") {
      const nextRuntime = transitionFormalNavigation(current, { type: "SENSOR_UNAVAILABLE", message });
      commitRuntime(nextRuntime);
      syncNavigationPause(nextRuntime.remainingDistanceMeters, "SENSOR_UNAVAILABLE");
    }
    setPlannerMessage(message);
  }, [commitRuntime, stopLocationWatch, stopVoicePlayback, syncNavigationPause]);

  const readOperationalDecision = useCallback(async (currentPlan: DirectedRoutePlan): Promise<RouteOperationalMonitorDecision> => {
    const route = {
      schemaVersion: 1 as const,
      routeId: currentPlan.routeFingerprint,
      scenicAreaId: currentPlan.scenicAreaId,
      networkRevision: currentPlan.networkRevision,
      operationalVersion: currentPlan.operationalVersion,
      expiresAt: currentPlan.expiresAt,
    };
    const readOffline = async () => {
      const cached = await readInstalledFormalRoutingSnapshot(currentPlan.scenicAreaId);
      if (cached) {
        const expectedPack = offlinePlanPackRef.current;
        if (
          planTransportRef.current === "OFFLINE_PACK"
          && (!expectedPack
            || cached.packId !== expectedPack.packId
            || cached.packRevision !== expectedPack.packRevision
            || cached.snapshotRevision !== expectedPack.snapshotRevision)
        ) {
          return evaluateRouteOperationalMonitor({
            route,
            source: { kind: "UNAVAILABLE", transport: "OFFLINE", code: "OFFLINE_PACK_CHANGED" },
          });
        }
        return evaluateRouteOperationalMonitor({
          route,
          source: { kind: "FORMAL_SNAPSHOT", transport: "OFFLINE", snapshot: cached },
        });
      }
      return evaluateRouteOperationalMonitor({
        route,
        source: { kind: "UNAVAILABLE", transport: "OFFLINE", code: "OFFLINE_SNAPSHOT_MISSING" },
      });
    };
    if (navigator.onLine === false) {
      return readOffline();
    }
    try {
      const response = await fetch(`/api/v1/scenic-areas/${encodeURIComponent(currentPlan.scenicAreaId)}/snapshot`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return evaluateRouteOperationalMonitor({
          route,
          source: { kind: "UNAVAILABLE", transport: "ONLINE", code: "FORMAL_NETWORK_UNAVAILABLE" },
        });
      }
      const body = await response.json() as unknown;
      return evaluateRouteOperationalMonitor({
        route,
        source: { kind: "FORMAL_SNAPSHOT", transport: "ONLINE", snapshot: body },
      });
    } catch {
      const cached = await readOffline();
      return cached.reason === "FORMAL_SNAPSHOT_UNAVAILABLE"
        ? evaluateRouteOperationalMonitor({
          route,
          source: { kind: "UNAVAILABLE", transport: "ONLINE", code: "NETWORK_REQUEST_FAILED" },
        })
        : cached;
    }
  }, []);

  const applyOperationalDecision = useCallback((decision: RouteOperationalMonitorDecision) => {
    if (decision.instructionState === "ACTIVE") return true;
    stopLocationWatch();
    stopVoicePlayback();
    const current = runtimeRef.current;
    if (!current) return false;
    const nextRuntime = decision.snapshot && decision.status === "PAUSE_FOR_DETERMINISTIC_REPLAN"
      ? transitionFormalNavigation(current, {
        type: "ROUTE_VERSION_CHANGED",
        networkRevision: decision.snapshot.networkRevision,
        operationalVersion: decision.snapshot.operationalVersion,
      })
      : transitionFormalNavigation(current, {
        type: "OPERATIONAL_STATE_UNAVAILABLE",
        message: decision.message,
      });
    commitRuntime(nextRuntime);
    setPlannerMessage(nextRuntime.message);
    syncNavigationRequireReroute(
      nextRuntime.remainingDistanceMeters,
      decision.snapshot && decision.status === "PAUSE_FOR_DETERMINISTIC_REPLAN"
        ? "NETWORK_VERSION_CHANGED"
        : "OPERATIONAL_STATE_UNAVAILABLE",
    );
    if (decision.snapshot && decision.status === "PAUSE_FOR_DETERMINISTIC_REPLAN") {
      scheduleAutomaticReroute(decision.reason === "NETWORK_REVISION_CHANGED"
        ? "NETWORK_REVISION_CHANGED"
        : "OPERATIONAL_VERSION_CHANGED");
    }
    return false;
  }, [commitRuntime, scheduleAutomaticReroute, stopLocationWatch, stopVoicePlayback, syncNavigationRequireReroute]);

  const beginLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;
    if (geolocationPermissionBlocksActivation(locationPermissionRef.current)) {
      suspendForLocationPermission("DENIED");
      return;
    }
    if (!("geolocation" in navigator)) {
      const current = runtimeRef.current;
      if (current) {
        const nextRuntime = transitionFormalNavigation(current, {
          type: "SENSOR_UNAVAILABLE",
          message: "当前浏览器不支持连续定位，导航已暂停。你仍可查看完整路线并按现场标识行动。",
        });
        commitRuntime(nextRuntime);
        syncNavigationPause(nextRuntime.remainingDistanceMeters, "SENSOR_UNAVAILABLE");
      }
      return;
    }
    const watchSequence = locationWatchSequenceRef.current + 1;
    locationWatchSequenceRef.current = watchSequence;
    watchIdRef.current = navigator.geolocation.watchPosition((position) => {
      if (locationWatchSequenceRef.current !== watchSequence) return;
      const currentPlan = planRef.current;
      const currentRuntime = runtimeRef.current;
      if (!currentPlan || !currentRuntime || currentRuntime.status !== "ACTIVE") return;
      const sample = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAtMs: position.timestamp,
      };
      if (
        Number.isFinite(sample.latitude)
        && Number.isFinite(sample.longitude)
        && Number.isFinite(sample.accuracyMeters)
      ) {
        commitLocationPermission("GRANTED");
        setLivePosition({
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracyMeters: sample.accuracyMeters,
        });
      }
      const advanced = advanceFormalNavigation(
        currentPlan,
        currentRuntime,
        trackerRef.current,
        sample,
        Date.now(),
      );
      trackerRef.current = advanced.tracker;
      setRouteMatch(advanced.tracker.routeMatch);
      if (advanced.tracker.previousAcceptedSample?.capturedAtMs === sample.capturedAtMs) {
        latestNavigationSampleRef.current = { ...sample };
      }
      commitRuntime(advanced.runtime);
      if (currentRuntime.status !== advanced.runtime.status) {
        if (advanced.runtime.status === "REROUTE_REQUIRED") {
          const confirmedOffRoute = advanced.runtime.guidanceQuality === "OFF_ROUTE";
          syncNavigationRequireReroute(
            advanced.runtime.remainingDistanceMeters,
            confirmedOffRoute ? "OFF_ROUTE" : "OPERATIONAL_STATE_UNAVAILABLE",
          );
          if (confirmedOffRoute) scheduleAutomaticReroute("OFF_ROUTE");
        } else if (advanced.runtime.status === "COMPLETED") {
          syncNavigationArrive();
        }
      }
      if (["REROUTE_REQUIRED", "COMPLETED", "CANCELLED"].includes(advanced.runtime.status)) {
        stopLocationWatch();
      }
    }, (error) => {
      if (locationWatchSequenceRef.current !== watchSequence) return;
      stopLocationWatch();
      latestNavigationSampleRef.current = null;
      setLivePosition(null);
      stopVoicePlayback();
      if (error.code === error.PERMISSION_DENIED) commitLocationPermission("DENIED");
      const current = runtimeRef.current;
      if (!current) return;
      const message = error.code === error.PERMISSION_DENIED
        ? "定位权限已拒绝，导航已暂停；系统不会反复请求权限。"
        : error.code === error.TIMEOUT
          ? "连续定位等待超时，导航已暂停。请移动到开阔处后手动恢复。"
          : "连续定位当前不可用，导航已暂停且不会继续显示旧方向指令。";
      const nextRuntime = transitionFormalNavigation(current, { type: "SENSOR_UNAVAILABLE", message });
      commitRuntime(nextRuntime);
      syncNavigationPause(nextRuntime.remainingDistanceMeters, "SENSOR_UNAVAILABLE");
      setPlannerMessage(message);
    }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 });
  }, [commitLocationPermission, commitRuntime, scheduleAutomaticReroute, stopLocationWatch, stopVoicePlayback, suspendForLocationPermission, syncNavigationArrive, syncNavigationPause, syncNavigationRequireReroute]);

  const startOrResumeNavigation = useCallback(async () => {
    const currentPlan = planRef.current;
    const currentRuntime = runtimeRef.current;
    if (!currentPlan || !currentRuntime || !(currentRuntime.status === "READY" || currentRuntime.status === "PAUSED")) return;
    if (geolocationPermissionBlocksActivation(locationPermissionRef.current)) {
      setPlannerMessage("定位权限已拒绝，无法启动或恢复实时导航。请先在浏览器设置中重新允许定位；系统不会自动恢复。 ");
      return;
    }
    if (formalNavigationPageLifecycleBlocksActivation(pageLifecycleStateRef.current)) {
      setPlannerMessage(pageLifecycleStateRef.current.phase === "BACKGROUND"
        ? "页面当前不在前台，不能启动定位或恢复旧方向指令。"
        : "页面恢复检查尚未完成，旧方向指令保持停止。");
      return;
    }
    setNavigationBusy(true);
    setPlannerMessage("正在开始前核验正式路网与封路版本…");
    try {
      const decision = await readOperationalDecision(currentPlan);
      if (planRef.current !== currentPlan || runtimeRef.current !== currentRuntime) return;
      if (!applyOperationalDecision(decision)) return;
      if (
        document.visibilityState !== "visible"
        || formalNavigationPageLifecycleBlocksActivation(pageLifecycleStateRef.current)
      ) {
        setPlannerMessage("核验期间页面离开前台，定位与旧方向指令保持停止。请回到页面后重新确认。");
        return;
      }
      const nextRuntime = transitionFormalNavigation(
        currentRuntime,
        { type: currentRuntime.status === "READY" ? "START" : "RESUME" },
      );
      trackerRef.current = currentRuntime.status === "READY"
        ? emptyNavigationTracker()
        : prepareFormalNavigationTrackerForResume(trackerRef.current);
      setRouteMatch(trackerRef.current.routeMatch);
      commitRuntime(nextRuntime);
      applyPageLifecycleEvent({ type: "NAVIGATION_ACTIVE" });
      if (planTransportRef.current === "ONLINE") syncNavigationStartOrResume(currentPlan, nextRuntime.remainingDistanceMeters);
      setPlannerMessage(planTransportRef.current === "OFFLINE_PACK"
        ? "已从本机验签包开始离线前台导航。精确坐标只在内存中参与匹配，离线过程不写入账号历史。"
        : "已开始前台实时导航。精确坐标仅在内存中参与匹配，不会保存或发送到服务端。",
      );
      beginLocationWatch();
    } finally {
      setNavigationBusy(false);
    }
  }, [applyOperationalDecision, applyPageLifecycleEvent, beginLocationWatch, commitRuntime, readOperationalDecision, syncNavigationStartOrResume]);

  const pauseNavigation = useCallback(() => {
    stopLocationWatch();
    stopVoicePlayback();
    const current = runtimeRef.current;
    if (!current) return;
    const nextRuntime = transitionFormalNavigation(current, { type: "PAUSE" });
    commitRuntime(nextRuntime);
    syncNavigationPause(nextRuntime.remainingDistanceMeters, "USER_PAUSED");
    setPlannerMessage(nextRuntime.message);
  }, [commitRuntime, stopLocationWatch, stopVoicePlayback, syncNavigationPause]);

  const exitNavigation = useCallback(() => {
    stopLocationWatch();
    stopVoicePlayback();
    setVoiceEnabled(false);
    setVoiceState("OFF");
    setVoiceMessage("本次导航已退出，前台语音也已关闭。");
    const current = runtimeRef.current;
    if (!current) return;
    const nextRuntime = transitionFormalNavigation(current, { type: "CANCEL" });
    trackerRef.current = emptyNavigationTracker();
    setLivePosition(null);
    setRouteMatch(null);
    applyPageLifecycleEvent({ type: "RESET" });
    commitRuntime(nextRuntime);
    syncNavigationCancel(nextRuntime.remainingDistanceMeters);
    setPlannerMessage(nextRuntime.message);
  }, [applyPageLifecycleEvent, commitRuntime, stopLocationWatch, stopVoicePlayback, syncNavigationCancel]);

  const toggleNavigationVoice = useCallback(() => {
    if (voiceEnabled) {
      stopVoicePlayback();
      setVoiceEnabled(false);
      setVoiceState("OFF");
      setVoiceMessage("导航语音已关闭；文字、地图与方向提示继续工作。");
      return;
    }
    const muted = globalSpeechMuted
      || document.documentElement.dataset.muted === "true"
      || readAccessibilityPreferences(window.localStorage).preferences.muted;
    if (muted) {
      setGlobalSpeechMuted(true);
      setVoiceState("OFF");
      setVoiceMessage("全局静音已开启；请先在“显示与辅助”中取消静音，再主动开启导航语音。");
      return;
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceState("UNSUPPORTED");
      setVoiceMessage("当前浏览器不支持前台语音；文字、地图与方向提示仍可继续使用。");
      return;
    }
    voiceTrackerRef.current = createFormalNavigationVoiceTracker();
    window.speechSynthesis.resume();
    setVoiceEnabled(true);
    setVoiceState("READY");
    setVoiceMessage("语音已开启；取得新的可靠前台定位后，将播报当前正式路线的关键指令。");
    runVoiceDecision(true);
  }, [globalSpeechMuted, runVoiceDecision, stopVoicePlayback, voiceEnabled]);

  const loadSnapshot = useCallback(async (signal?: AbortSignal) => {
    setPhase("loading");
    setSnapshot(null);
    setSnapshotTransport(null);
    setOfflineMapBundle(null);
    setRecommendedRouteId("");
    setTravelGroupMembers([]);
    offlineSnapshotRef.current = null;
    autoLocatedRevisionRef.current = null;
    discardCurrentPlan();
    setMessage("正在核验正式路网与运营状态…");
    const activateOfflineSnapshot = async () => {
      const [cached, cachedMap] = await Promise.all([
        readInstalledFormalRoutingSnapshot(scenicAreaId),
        readInstalledFormalOfflineMapBundle(scenicAreaId),
      ]);
      if (!cached || !isSnapshot(cached)) return false;
      const matchingMap = cachedMap
        && cachedMap.scenicAreaId === cached.scenicAreaId
        && cachedMap.packId === cached.packId
        && cachedMap.packRevision === cached.packRevision
        && cachedMap.snapshotRevision === cached.snapshotRevision
        && cachedMap.networkRevision === cached.networkRevision
        && cachedMap.operationalVersion === cached.operationalVersion
        ? cachedMap
        : null;
      const entrance = cached.routeNetwork.entrances[0];
      const destinations = cached.routeNetwork.nodes.filter((node) => node.type === "DESTINATION" || node.type === "FACILITY");
      offlineSnapshotRef.current = cached;
      setSnapshot(cached);
      setSnapshotTransport("OFFLINE_PACK");
      setOfflineMapBundle(matchingMap);
      setOriginNodeId(entrance?.publicNodeId ?? cached.routeNetwork.nodes[0]?.id ?? "");
      setDestinationNodeId(destinations[0]?.id ?? "");
      setPhase("ready");
      setMessage(destinations.length
        ? matchingMap
          ? "网络不可用，已从同一个本机验签包加载正式离线路网、运营状态、矢量底图与景点。"
          : "网络不可用，已加载本机验签且仍在有效期内的正式离线路网；底图资源未通过安全渲染门禁，仅显示路线示意层。"
        : "正式离线路网仍有效，但当前包没有可供游客选择的目的节点。",
      );
      return true;
    };
    try {
      if (navigator.onLine === false) {
        if (await activateOfflineSnapshot()) return;
        setPhase("unavailable");
        setMessage("当前离线且本机没有仍在有效期内的验签正式包，内部导航保持停止。");
        return;
      }
      const response = await fetch(`/api/v1/scenic-areas/${encodeURIComponent(scenicAreaId)}/snapshot`, {
        cache: "no-store",
        signal,
      });
      const body = await response.json() as unknown;
      if (response.status === 503) {
        if (await activateOfflineSnapshot()) return;
        setPhase("unavailable");
        setMessage(errorMessage(body, "正式景区内部路网尚未发布，当前不会生成内部路线。"));
        return;
      }
      const nextSnapshot = typeof body === "object" && body !== null
        ? (body as { snapshot?: unknown }).snapshot
        : null;
      if (!response.ok || !isSnapshot(nextSnapshot)) throw new Error("snapshot_invalid");
      const entrance = nextSnapshot.routeNetwork.entrances[0];
      const destinations = nextSnapshot.routeNetwork.nodes.filter((node) => node.type === "DESTINATION" || node.type === "FACILITY");
      setSnapshot(nextSnapshot);
      setSnapshotTransport("ONLINE");
      setOriginNodeId(entrance?.publicNodeId ?? nextSnapshot.routeNetwork.nodes[0]?.id ?? "");
      setDestinationNodeId(destinations[0]?.id ?? "");
      setPhase("ready");
      setMessage(destinations.length
        ? "正式路网、动态状态和目的节点均已通过服务端核验。"
        : "正式路网可读取，但还没有可供游客选择的目的节点。");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (await activateOfflineSnapshot()) return;
      setPhase("error");
      setMessage("正式导航服务暂时无法连接，且本机没有当前有效验签包；不会沿用旧路线或候选路网。");
    }
  }, [discardCurrentPlan, scenicAreaId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadSnapshot(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSnapshot]);

  useEffect(() => () => {
    stopLocationWatch();
    voiceSequenceRef.current += 1;
    if (voiceOwnsPlaybackRef.current && "speechSynthesis" in window) window.speechSynthesis.cancel();
    voiceOwnsPlaybackRef.current = false;
  }, [stopLocationWatch]);

  useEffect(() => {
    const syncGlobalSpeechMute = () => {
      const stored = readAccessibilityPreferences(window.localStorage).preferences.muted;
      const muted = document.documentElement.dataset.muted === "true" || stored;
      setGlobalSpeechMuted(muted);
      if (!muted) return;
      stopVoicePlayback();
      setVoiceEnabled(false);
      setVoiceState("OFF");
      setVoiceMessage("全局静音已开启；导航语音保持关闭。可在“显示与辅助”中取消静音后再主动开启。");
    };
    const onPreferenceChange = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== ACCESSIBILITY_PREFERENCES_KEY && event.key !== null) return;
      queueMicrotask(syncGlobalSpeechMute);
    };
    syncGlobalSpeechMute();
    window.addEventListener("storage", onPreferenceChange);
    window.addEventListener(ACCESSIBILITY_PREFERENCES_EVENT, onPreferenceChange);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, onPreferenceChange);
    return () => {
      window.removeEventListener("storage", onPreferenceChange);
      window.removeEventListener(ACCESSIBILITY_PREFERENCES_EVENT, onPreferenceChange);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, onPreferenceChange);
    };
  }, [stopVoicePlayback]);

  useEffect(() => {
    runVoiceDecision();
  }, [globalSpeechMuted, navigationRuntime, pageLifecycleState.phase, routeMatch, runVoiceDecision, voiceEnabled]);

  useEffect(() => {
    const status = navigationRuntime?.status;
    if (!(status === "READY" || status === "ACTIVE" || status === "PAUSED" || status === "REROUTE_REQUIRED")) return;
    let checking = false;
    const verifyCurrentRoute = async () => {
      const currentPlan = planRef.current;
      if (!currentPlan || checking) return;
      checking = true;
      try {
        const decision = await readOperationalDecision(currentPlan);
        applyOperationalDecision(decision);
      } finally {
        checking = false;
      }
    };
    const suspendPage = (reason: "VISIBILITY_HIDDEN" | "PAGEHIDE" | "FREEZE") => {
      const current = runtimeRef.current;
      stopVoicePlayback();
      const lifecycle = applyPageLifecycleEvent({
        type: "SUSPEND",
        reason,
        navigationWasActive: current?.status === "ACTIVE",
      });
      if (lifecycle.shouldClearEphemeralLocation) latestNavigationSampleRef.current = null;
      if (!lifecycle.shouldPauseNavigation || current?.status !== "ACTIVE") return;
      stopLocationWatch();
      const nextRuntime = transitionFormalNavigation(current, { type: "PAUSE" });
      const lifecycleMessage = reason === "FREEZE"
        ? "页面被设备冻结，实时定位与方向指令已自动暂停；最近定位不会用于恢复重算。"
        : reason === "PAGEHIDE"
          ? "页面被系统挂起或离开，实时定位与方向指令已自动暂停；最近定位不会用于恢复重算。"
          : "页面进入后台，实时定位与方向指令已自动暂停；最近定位不会用于恢复重算。";
      commitRuntime({ ...nextRuntime, message: lifecycleMessage });
      syncNavigationPause(nextRuntime.remainingDistanceMeters, "PAGE_HIDDEN");
      setPlannerMessage(lifecycleMessage);
    };
    const restorePage = async () => {
      const previousPhase = pageLifecycleStateRef.current.phase;
      const lifecycle = applyPageLifecycleEvent({ type: "RESTORE_REQUESTED" });
      if (!lifecycle.shouldVerifyRoute) {
        // A visible/pageshow event without a matching suspension still receives
        // the normal immediate operational check, but duplicate restore events
        // while VERIFYING do not start parallel lifecycle checks.
        if (previousPhase === "FOREGROUND") void verifyCurrentRoute();
        return;
      }
      const currentPlan = planRef.current;
      const currentRuntime = runtimeRef.current;
      if (!currentPlan || !currentRuntime) {
        applyPageLifecycleEvent({ type: "RESET" });
        return;
      }
      setPlannerMessage("页面已回到前台，正在重新核验正式路网与运营状态；旧方向指令保持停止。");
      const decision = await readOperationalDecision(currentPlan);
      if (planRef.current !== currentPlan || runtimeRef.current !== currentRuntime) return;
      const mayContinue = applyOperationalDecision(decision);
      // The page may have been hidden again while the current snapshot was read.
      if (
        pageLifecycleStateRef.current.phase !== "VERIFYING"
        || document.visibilityState !== "visible"
      ) return;
      const verifiedLifecycle = applyPageLifecycleEvent({ type: mayContinue ? "VERIFY_SUCCEEDED" : "VERIFY_FAILED" });
      if (mayContinue) {
        setPlannerMessage(verifiedLifecycle.state.phase === "READY_TO_RESUME"
          ? "前台状态与正式版本已重新核验。请显式确认恢复；系统随后只接受新的可靠定位。"
          : "页面已回到前台，正式路网与运营状态仍有效；导航继续保持当前手动暂停状态。");
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        suspendPage("VISIBILITY_HIDDEN");
      } else {
        void restorePage();
      }
    };
    const onPageHide = () => suspendPage("PAGEHIDE");
    const onPageShow = () => { void restorePage(); };
    const onFreeze: EventListener = () => suspendPage("FREEZE");
    const onResume: EventListener = () => { void restorePage(); };
    const onNetworkChange = () => {
      if (document.visibilityState === "visible") void verifyCurrentRoute();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifyCurrentRoute();
    }, ROUTE_OPERATION_MONITOR_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    window.addEventListener("online", onNetworkChange);
    window.addEventListener("offline", onNetworkChange);
    if (document.visibilityState === "hidden") suspendPage("VISIBILITY_HIDDEN");
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
      window.removeEventListener("online", onNetworkChange);
      window.removeEventListener("offline", onNetworkChange);
    };
  }, [applyOperationalDecision, applyPageLifecycleEvent, commitRuntime, navigationRuntime?.status, readOperationalDecision, stopLocationWatch, stopVoicePlayback, syncNavigationPause]);

  const destinations = useMemo(
    () => snapshot?.routeNetwork.nodes.filter((node) => node.type === "DESTINATION" || node.type === "FACILITY") ?? [],
    [snapshot],
  );
  const selectedDestination = useMemo(
    () => destinations.find((node) => node.id === destinationNodeId) ?? null,
    [destinationNodeId, destinations],
  );
  const recommendedRoutes = useMemo(
    () => snapshot?.routeNetwork.recommendedRoutes ?? [],
    [snapshot],
  );
  const selectedRecommendedRoute = useMemo(
    () => recommendedRoutes.find((route) => route.id === recommendedRouteId) ?? null,
    [recommendedRouteId, recommendedRoutes],
  );
  const itineraryExitNodeId = useMemo(() => {
    if (!snapshot) return originNodeId;
    const nodeIds = new Set(snapshot.routeNetwork.nodes.map((node) => node.id));
    return snapshot.routeNetwork.entrances.find((entrance) => nodeIds.has(entrance.publicNodeId))?.publicNodeId
      ?? originNodeId;
  }, [originNodeId, snapshot]);

  const locateFromDevice = useCallback((mode: "MANUAL" | "AUTO" = "MANUAL") => {
    if (!snapshot || !("geolocation" in navigator)) {
      commitLocationPermission("UNAVAILABLE");
      setPlannerMessage("当前浏览器不支持定位，请手动选择已发布起点。");
      return;
    }
    autoLocatedRevisionRef.current = snapshot.networkRevision;
    setRecommendedRouteId("");
    discardCurrentPlan();
    const requestSequence = locationRequestSequenceRef.current + 1;
    locationRequestSequenceRef.current = requestSequence;
    setLocating(true);
    setPlannerMessage(mode === "AUTO"
      ? "已检测到定位权限，正在自动匹配当前正式路网；精确坐标不会保存或发送到服务端。"
      : "正在请求一次高精度定位；精确坐标不会保存或发送到服务端。",
    );
    navigator.geolocation.getCurrentPosition((position) => {
      if (locationRequestSequenceRef.current !== requestSequence) return;
      setLocating(false);
      commitLocationPermission("GRANTED");
      const match = matchLocationToFormalNode({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      }, snapshot.routeNetwork.nodes);
      if (!match.ok && (match.code === "INVALID_SAMPLE" || match.code === "LOW_ACCURACY")) {
        setPlannerMessage("本次定位精度不足 50 米门限，已拒绝自动匹配路网节点。请移动到开阔处重试或手动选择起点。");
        return;
      }
      if (!match.ok) {
        setPlannerMessage("当前位置无法可靠匹配到 80 米内的正式路网节点，已保持手动起点并停止自动规划。");
        return;
      }
      const nearestNode = snapshot.routeNetwork.nodes.find((node) => node.id === match.nodeId);
      if (!nearestNode) {
        setPlannerMessage("正式路网节点已变化，请刷新快照后重试。");
        return;
      }
      setOriginNodeId(nearestNode.id);
      setPlannerMessage(`已匹配“${nodeLabel(nearestNode)}”；浏览器报告精度约 ${Math.round(match.accuracyMeters)} 米。精确坐标未保存。`);
    }, (error) => {
      if (locationRequestSequenceRef.current !== requestSequence) return;
      setLocating(false);
      if (error.code === error.PERMISSION_DENIED) {
        commitLocationPermission("DENIED");
        setPlannerMessage("定位权限已拒绝。你仍可手动选择已发布起点，系统不会反复请求权限。");
      } else if (error.code === error.TIMEOUT) {
        setPlannerMessage("高精度定位等待超时，请在开阔处手动重试或选择起点。");
      } else {
        setPlannerMessage("当前位置暂不可用，已停止定位且不会使用旧位置。");
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
  }, [commitLocationPermission, discardCurrentPlan, snapshot]);

  useEffect(() => {
    if (!snapshot || phase !== "ready") return;
    if (!("geolocation" in navigator)) {
      const timer = window.setTimeout(() => commitLocationPermission("UNAVAILABLE"), 0);
      return () => window.clearTimeout(timer);
    }
    if (!("permissions" in navigator) || typeof navigator.permissions.query !== "function") {
      const timer = window.setTimeout(() => commitLocationPermission("UNAVAILABLE"), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    let permission: PermissionStatus | null = null;
    let permissionInitialized = false;
    const applyPermission = () => {
      if (cancelled || !permission) return;
      const isInitialObservation = !permissionInitialized;
      permissionInitialized = true;
      const previousState = locationPermissionRef.current;
      const decision = decideGeolocationPermissionTransition({
        previousState,
        browserState: permission.state,
        sessionActive: runtimeRef.current?.status === "ACTIVE",
        hasCommittedRoute: Boolean(planRef.current),
        foreground: document.visibilityState === "visible"
          && pageLifecycleStateRef.current.phase === "FOREGROUND",
        automaticLocateConsumed: autoLocatedRevisionRef.current === snapshot.networkRevision,
      });
      commitLocationPermission(decision.state);
      if (decision.shouldInvalidatePendingRequest) {
        locationRequestSequenceRef.current += 1;
        setLocating(false);
      }
      if (decision.shouldClearEphemeralPosition) {
        latestNavigationSampleRef.current = null;
        setLivePosition(null);
      }
      if (
        decision.state !== "GRANTED"
        && (
          previousState === "GRANTED"
          || !isInitialObservation
          || decision.shouldSuspendActiveSession
          || decision.shouldClearEphemeralPosition
        )
      ) {
        suspendForLocationPermission(decision.state === "DENIED" ? "DENIED" : "PROMPT");
        return;
      }
      if (decision.shouldAutomaticallyLocate) {
        autoLocatedRevisionRef.current = snapshot.networkRevision;
        locateFromDevice("AUTO");
      }
    };
    void navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (cancelled) return;
      permission = result;
      applyPermission();
      permission.addEventListener("change", applyPermission);
    }).catch(() => {
      if (!cancelled) commitLocationPermission("UNAVAILABLE");
    });
    return () => {
      cancelled = true;
      permission?.removeEventListener("change", applyPermission);
    };
  }, [commitLocationPermission, locateFromDevice, phase, snapshot, suspendForLocationPermission]);

  const createPlan = useCallback(async () => {
    if (!snapshot || !originNodeId || !destinationNodeId || originNodeId === destinationNodeId) {
      setPlannerMessage("请选择不同的正式起点和目的地。");
      return;
    }
    setPlanning(true);
    discardCurrentPlan();
    setPlannerMessage("正在使用当前发布版本计算路线…");
    const allowedTraversalModes = [
      ...PEDESTRIAN_ROUTE_TRAVERSAL_MODES.filter((mode) => !stepFree || mode !== "STAIRS"),
      ...(allowCableway ? ["CABLEWAY" as const] : []),
      ...(allowShuttle ? ["SHUTTLE" as const] : []),
    ];
    const routeRequest = {
      scenicAreaId,
      fromNodeId: originNodeId,
      toNodeId: destinationNodeId,
      expectedNetworkRevision: snapshot.networkRevision,
      expectedOperationalVersion: snapshot.operationalVersion,
      profile: stepFree
        ? { kind: "STEP_FREE" as const, maxSlopePercent: 5, minimumWidthMeters: 0.9 }
        : { kind: "WALK" as const, maxSlopePercent: null, minimumWidthMeters: null },
      optimization,
      preference: { pace, maximumDifficulty, allowedTraversalModes },
      ...(selectedRecommendedRoute
        && selectedRecommendedRoute.originNodeId === originNodeId
        && selectedRecommendedRoute.destinationNodeId === destinationNodeId
        ? { recommendedRouteId: selectedRecommendedRoute.id }
        : {}),
    };
    try {
      let routePlan: unknown = null;
      let failureMessage = "当前没有符合这些条件的正式安全路线。";
      let planTransport: SnapshotTransport = "ONLINE";
      if (snapshotTransport === "OFFLINE_PACK") {
        const selectedCached = offlineSnapshotRef.current;
        const cached = await readInstalledFormalRoutingSnapshot(scenicAreaId);
        if (
          !selectedCached
          || !cached
          || cached.packId !== selectedCached.packId
          || cached.packRevision !== selectedCached.packRevision
          || cached.snapshotRevision !== selectedCached.snapshotRevision
          || cached.networkRevision !== snapshot.networkRevision
          || cached.operationalVersion !== snapshot.operationalVersion
        ) throw new Error("offline_snapshot_changed");
        offlineSnapshotRef.current = cached;
        const result = planDirectedRoute(cached.routeNetwork, cached.operationalState, routeRequest, new Date());
        if (result.ok) routePlan = result.plan;
        else failureMessage = result.code === "NO_SAFE_PATH"
          ? "当前离线运营状态下没有符合条件的安全路线。"
          : "本机正式路网或运营状态已失效，请联网重新核验。";
        planTransport = "OFFLINE_PACK";
        offlinePlanPackRef.current = {
          packId: cached.packId,
          packRevision: cached.packRevision,
          snapshotRevision: cached.snapshotRevision,
        };
      } else {
        const response = await fetch("/api/v1/route-plans", {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(routeRequest),
        });
        const body = await response.json() as unknown;
        routePlan = typeof body === "object" && body !== null
          ? (body as { routePlan?: unknown }).routePlan
          : null;
        if (!response.ok) failureMessage = errorMessage(body, failureMessage);
      }
      if (
        !isRoutePlan(routePlan)
        || routePlan.scenicAreaId !== scenicAreaId
        || routePlan.networkRevision !== snapshot.networkRevision
        || routePlan.operationalVersion !== snapshot.operationalVersion
        || routePlan.originNodeId !== originNodeId
        || routePlan.destinationNodeId !== destinationNodeId
        || routePlan.optimization !== optimization
        || routePlan.recommendedRouteId !== routeRequest.recommendedRouteId
      ) {
        setPlannerMessage(failureMessage);
        return;
      }
      const created = createFormalNavigationRuntime(routePlan);
      if (!created.ok) {
        setPlannerMessage(created.message);
        return;
      }
      planRef.current = routePlan;
      planTransportRef.current = planTransport;
      trackerRef.current = created.tracker;
      setRouteMatch(null);
      setPlan(routePlan);
      commitRuntime(created.runtime);
      setPlannerMessage(routePlan.recommendedRouteId
        ? `${planTransport === "OFFLINE_PACK" ? "本机" : "在线"}已按管理员发布的推荐边序列生成路线；任何路段关闭或不符合当前约束都会拒绝使用。`
        : planTransport === "OFFLINE_PACK"
          ? "离线路线已在本机使用验签路网计算，并绑定当前缓存运营版本；版本过期时会立即停止。"
          : "路线已绑定当前路网与运营版本；版本变化时必须重新规划。",
      );
    } catch {
      setPlannerMessage("路线服务暂时不可用，已停止规划且不会回退到候选路线。");
    } finally {
      setPlanning(false);
    }
  }, [allowCableway, allowShuttle, commitRuntime, destinationNodeId, discardCurrentPlan, maximumDifficulty, optimization, originNodeId, pace, scenicAreaId, selectedRecommendedRoute, snapshot, snapshotTransport, stepFree]);

  const readFreshRerouteSample = useCallback(async () => {
    const nowMs = Date.now();
    const current = latestNavigationSampleRef.current;
    if (
      current
      && current.accuracyMeters <= FORMAL_NAVIGATION_MAX_ACCURACY_METERS
      && current.capturedAtMs <= nowMs + 1_000
      && nowMs - current.capturedAtMs <= FORMAL_NAVIGATION_SAMPLE_MAX_AGE_MS
    ) {
      return { ...current };
    }
    if (!("geolocation" in navigator)) return null;
    return new Promise<FormalNavigationLocationSample | null>((resolve) => {
      navigator.geolocation.getCurrentPosition((position) => {
        const sample = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAtMs: position.timestamp,
        };
        if (
          Number.isFinite(sample.latitude)
          && Number.isFinite(sample.longitude)
          && Number.isFinite(sample.accuracyMeters)
          && Number.isFinite(sample.capturedAtMs)
        ) {
          latestNavigationSampleRef.current = { ...sample };
          setLivePosition({
            latitude: sample.latitude,
            longitude: sample.longitude,
            accuracyMeters: sample.accuracyMeters,
          });
          resolve(sample);
          return;
        }
        resolve(null);
      }, () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
    });
  }, []);

  const readRerouteSnapshot = useCallback(async (currentPlan: DirectedRoutePlan) => {
    const route = monitorRouteBinding(currentPlan);
    const readOffline = async () => {
      const [cached, cachedMap] = await Promise.all([
        readInstalledFormalRoutingSnapshot(currentPlan.scenicAreaId),
        readInstalledFormalOfflineMapBundle(currentPlan.scenicAreaId),
      ]);
      const parsed = cached ? formalSnapshotFromEnvelope(cached) : null;
      if (!cached || !parsed) return null;
      const matchingMap = cachedMap
        && cachedMap.scenicAreaId === cached.scenicAreaId
        && cachedMap.packId === cached.packId
        && cachedMap.packRevision === cached.packRevision
        && cachedMap.snapshotRevision === cached.snapshotRevision
        && cachedMap.networkRevision === cached.networkRevision
        && cachedMap.operationalVersion === cached.operationalVersion
        ? cachedMap
        : null;
      return {
        snapshot: parsed,
        rawSnapshot: cached as unknown,
        decision: evaluateRouteOperationalMonitor({
          route,
          source: { kind: "FORMAL_SNAPSHOT", transport: "OFFLINE", snapshot: cached },
        }),
        transport: "OFFLINE_PACK" as const,
        cached,
        mapBundle: matchingMap,
      };
    };
    if (navigator.onLine === false) return readOffline();
    try {
      const response = await fetch(`/api/v1/scenic-areas/${encodeURIComponent(currentPlan.scenicAreaId)}/snapshot`, {
        cache: "no-store",
      });
      if (!response.ok) return readOffline();
      const body = await response.json() as unknown;
      const parsed = formalSnapshotFromEnvelope(body);
      if (!parsed) return null;
      return {
        snapshot: parsed,
        rawSnapshot: body,
        decision: evaluateRouteOperationalMonitor({
          route,
          source: { kind: "FORMAL_SNAPSHOT", transport: "ONLINE", snapshot: body },
        }),
        transport: "ONLINE" as const,
        cached: null,
        mapBundle: null,
      };
    } catch {
      return readOffline();
    }
  }, []);

  const performAutomaticReroute = useCallback(async (trigger: AutomaticRerouteTrigger) => {
    const currentPlan = planRef.current;
    const currentRuntime = runtimeRef.current;
    if (!currentPlan || currentRuntime?.status !== "REROUTE_REQUIRED") return;
    const stillCurrent = () => (
      planRef.current === currentPlan
      && runtimeRef.current?.status === "REROUTE_REQUIRED"
      && rerouteSequenceRef.current === trigger.sequence
    );

    setPlanning(true);
    setAutomaticRerouteState("LOCATING");
    setPlannerMessage("旧方向指令已停止；正在取得新鲜定位，仅在本机匹配正式节点…");
    try {
      const sample = await readFreshRerouteSample();
      if (!stillCurrent()) return;
      if (!sample) {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage(automaticRerouteFailureMessage("LOCATION_INVALID"));
        return;
      }

      setAutomaticRerouteState("REFRESHING");
      setPlannerMessage("正在重新核验完整正式路网与运营版本…");
      const target = await readRerouteSnapshot(currentPlan);
      if (!stillCurrent()) return;
      if (!target || target.decision.instructionState === "STOPPED") {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage(target?.decision.message ?? "无法取得当前完整正式快照，旧指令保持停止；请按现场标识行动并向工作人员求助。");
        return;
      }

      const effectiveReason: FormalNavigationRerouteReason = target.decision.status === "PAUSE_FOR_DETERMINISTIC_REPLAN"
        ? target.decision.reason === "NETWORK_REVISION_CHANGED"
          ? "NETWORK_REVISION_CHANGED"
          : "OPERATIONAL_VERSION_CHANGED"
        : trigger.reason;
      const intentResult = buildFormalNavigationRerouteIntent({
        plan: currentPlan,
        snapshot: {
          networkRevision: target.snapshot.networkRevision,
          operationalVersion: target.snapshot.operationalVersion,
          nodes: target.snapshot.routeNetwork.nodes,
        },
        sample,
        reason: effectiveReason,
      });
      if (!intentResult.ok) {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage(automaticRerouteFailureMessage(intentResult.code));
        return;
      }

      setAutomaticRerouteState("PLANNING");
      setPlannerMessage("已匹配当前正式节点，正在确定性计算新的安全路线…");
      let replacement: unknown = null;
      let failureMessage = "当前没有可安全使用的正式替代路线；请按现场标识行动并向工作人员求助。";
      if (target.transport === "OFFLINE_PACK") {
        if (!target.cached) throw new Error("offline_reroute_snapshot_missing");
        const result = planDirectedRoute(
          target.cached.routeNetwork,
          target.cached.operationalState,
          intentResult.intent.request,
          new Date(),
        );
        if (result.ok) replacement = result.plan;
        else failureMessage = result.message;
      } else {
        const response = await fetch("/api/v1/route-plans", {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(intentResult.intent.request),
        });
        const body = await response.json() as unknown;
        replacement = typeof body === "object" && body !== null
          ? (body as { routePlan?: unknown }).routePlan
          : null;
        if (!response.ok) failureMessage = errorMessage(body, failureMessage);
      }
      if (!stillCurrent()) return;
      if (
        !isRoutePlan(replacement)
        || replacement.routeFingerprint === currentPlan.routeFingerprint
        || replacement.scenicAreaId !== intentResult.intent.request.scenicAreaId
        || replacement.originNodeId !== intentResult.intent.request.fromNodeId
        || replacement.destinationNodeId !== intentResult.intent.request.toNodeId
        || replacement.networkRevision !== intentResult.intent.request.expectedNetworkRevision
        || replacement.operationalVersion !== intentResult.intent.request.expectedOperationalVersion
        || replacement.optimization !== intentResult.intent.request.optimization
        || JSON.stringify(replacement.profile) !== JSON.stringify(intentResult.intent.request.profile)
        || JSON.stringify(replacement.preference) !== JSON.stringify(intentResult.intent.request.preference)
      ) {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage(failureMessage);
        return;
      }

      if (target.decision.replanRequest) {
        const resolved = evaluateDeterministicRouteOperationalReplan(
          target.decision.replanRequest,
          {
            kind: "DETERMINISTIC_ROUTE_AVAILABLE",
            route: monitorRouteBinding(replacement),
            snapshot: target.rawSnapshot,
          },
        );
        if (resolved.instructionState !== "ACTIVE") {
          setAutomaticRerouteState("FAILED");
          setPlannerMessage(resolved.message);
          return;
        }
      } else if (target.decision.status !== "CONTINUE") {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage("当前正式版本无法证明可继续，旧指令保持停止。请按现场标识行动。");
        return;
      }

      const created = createFormalNavigationRuntime(replacement);
      if (!created.ok) {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage(created.message);
        return;
      }
      const activeRuntime = transitionFormalNavigation(created.runtime, { type: "START" });
      if (activeRuntime.status !== "ACTIVE") {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage("替代路线未能进入安全导航状态，旧指令保持停止。");
        return;
      }
      if (
        document.visibilityState !== "visible"
        || pageLifecycleStateRef.current.phase === "BACKGROUND"
        || pageLifecycleStateRef.current.phase === "VERIFYING"
      ) {
        setAutomaticRerouteState("FAILED");
        setPlannerMessage("安全路线重算期间页面离开前台，结果未被激活；旧指令保持停止。请回到页面后重试。");
        return;
      }

      setSnapshot(target.snapshot);
      setSnapshotTransport(target.transport);
      setOfflineMapBundle(target.mapBundle);
      offlineSnapshotRef.current = target.cached;
      offlinePlanPackRef.current = target.cached
        ? { packId: target.cached.packId, packRevision: target.cached.packRevision, snapshotRevision: target.cached.snapshotRevision }
        : null;
      planTransportRef.current = target.transport;
      planRef.current = replacement;
      trackerRef.current = created.tracker;
      setRouteMatch(null);
      latestNavigationSampleRef.current = { ...sample };
      setOriginNodeId(replacement.originNodeId);
      setDestinationNodeId(replacement.destinationNodeId);
      setPlan(replacement);
      commitRuntime(activeRuntime);
      applyPageLifecycleEvent({ type: "NAVIGATION_ACTIVE" });
      setAutomaticRerouteState("IDLE");
      setAutomaticRerouteTrigger(null);
      if (target.transport === "ONLINE") syncNavigationStartOrResume(replacement, activeRuntime.remainingDistanceMeters);
      setMessage("正式路网、运营版本和目的节点已重新核验。");
      setPlannerMessage(target.transport === "OFFLINE_PACK"
        ? "已在本机验签包内完成确定性重算并自动恢复前台导航；精确坐标未保存或上传。"
        : "已使用最新正式快照完成确定性重算并自动恢复前台导航；服务端只收到节点 ID 和路线偏好。",
      );
      beginLocationWatch();
    } catch {
      if (!stillCurrent()) return;
      setAutomaticRerouteState("FAILED");
      setPlannerMessage("自动重算服务暂时不可用，旧指令保持停止；不会回退到候选路线或地图商路线。");
    } finally {
      if (rerouteSequenceRef.current === trigger.sequence) setPlanning(false);
    }
  }, [applyPageLifecycleEvent, beginLocationWatch, commitRuntime, readFreshRerouteSample, readRerouteSnapshot, syncNavigationStartOrResume]);

  useEffect(() => {
    if (
      navigationRuntime?.status !== "REROUTE_REQUIRED"
      || !automaticRerouteTrigger
      || rerouteAttemptedSequenceRef.current >= automaticRerouteTrigger.sequence
    ) return;
    rerouteAttemptedSequenceRef.current = automaticRerouteTrigger.sequence;
    void performAutomaticReroute(automaticRerouteTrigger);
  }, [automaticRerouteTrigger, navigationRuntime?.status, performAutomaticReroute]);

  const retryAutomaticReroute = useCallback(() => {
    scheduleAutomaticReroute(lastRerouteReasonRef.current);
  }, [scheduleAutomaticReroute]);

  const useItinerarySegment = useCallback((candidate: DirectedRoutePlan) => {
    if (
      !snapshot
      || !isRoutePlan(candidate)
      || candidate.scenicAreaId !== scenicAreaId
      || candidate.networkRevision !== snapshot.networkRevision
      || candidate.operationalVersion !== snapshot.operationalVersion
      || candidate.originNodeId !== originNodeId
      || !snapshot.routeNetwork.nodes.some((node) => node.id === candidate.destinationNodeId)
    ) {
      setPlannerMessage("个性路线首段与当前起点或正式版本不一致，请重新生成。");
      return;
    }
    const created = createFormalNavigationRuntime(candidate);
    if (!created.ok) {
      setPlannerMessage(created.message);
      return;
    }
    discardCurrentPlan();
    setRecommendedRouteId("");
    setDestinationNodeId(candidate.destinationNodeId);
    planRef.current = candidate;
    planTransportRef.current = "ONLINE";
    trackerRef.current = created.tracker;
    setRouteMatch(null);
    setPlan(candidate);
    commitRuntime(created.runtime);
    setPlannerMessage("个性路线首段已进入导航；到达后可按已生成行程继续下一段。");
  }, [commitRuntime, discardCurrentPlan, originNodeId, scenicAreaId, snapshot]);

  const handleRecommendedRoute = useCallback((route: FormalRecommendedRoute) => {
    discardCurrentPlan();
    setRecommendedRouteId(route.id);
    setOriginNodeId(route.originNodeId);
    setDestinationNodeId(route.destinationNodeId);
    setOptimization("SCENIC");
    setAllowCableway(route.traversalModes.includes("CABLEWAY"));
    setAllowShuttle(route.traversalModes.includes("SHUTTLE"));
    setPlannerMessage(`已选择管理员推荐路线“${route.name}”；生成时仍会按当前开放状态、难度和无障碍约束逐段复核。`);
  }, [discardCurrentPlan]);

  return (
    <section className="mx-auto mb-6 max-w-6xl rounded-[2rem] border border-[#173f35]/12 bg-[#fffdf7] p-5 shadow-[0_20px_60px_rgba(44,69,58,.09)] sm:p-6" aria-labelledby="formal-navigation-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#76551f]">Verified internal routing</p>
          <h2 id="formal-navigation-title" className="mt-2 text-2xl font-semibold tracking-[-.035em] text-[#173f35]">正式景区内部导航</h2>
          <p className="mt-2 text-sm leading-6 text-[#61716a]">只读取管理方发布、现场核验且仍在有效期内的 WGS84 路网。公开道路继续交由高德；两类路线不会混成一条未经核验的内部导航。</p>
        </div>
        <button type="button" onClick={() => void loadSnapshot()} className="min-h-11 rounded-full border border-[#173f35]/16 px-4 text-sm font-medium text-[#173f35] outline-none transition-transform active:scale-[.98] focus-visible:ring-3 focus-visible:ring-[#b88a43]">重新核验</button>
      </div>

      {phase === "loading" && <div role="status" className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl bg-[#e7eee8] p-4 text-sm text-[#52675d]"><SpinnerGap className="animate-spin motion-reduce:animate-none" size={20} />{message}</div>}

      {(phase === "unavailable" || phase === "error") && <div role="status" className="mt-5 rounded-2xl border border-[#b88a43]/25 bg-[#fff8e9] p-4 text-sm leading-6 text-[#675c49]"><span className="flex items-start gap-2"><WarningCircle className="mt-0.5 shrink-0 text-[#9b6330]" size={20} /><span><strong className="block text-[#725929]">{phase === "unavailable" ? "正式内部导航尚未开放" : "正式导航服务不可用"}</strong><span className="mt-1 block">{message}</span></span></span><p className="mt-3 text-xs leading-5">当前仍可使用页面内的高德公开道路导航和现场标识；系统不会用 OSM 候选线、演练数据或过期缓存补位。</p></div>}

      <div className="mt-5">
        <OfflinePackControl
          scenicAreaId={scenicAreaId}
          compact
          onInstalled={() => void loadSnapshot()}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[#173f35]/12">
        <TravelGroupNavigator onMembersChange={setTravelGroupMembers} />
      </div>

      {phase === "ready" && snapshot && <div className="mt-5 border-t border-[#173f35]/10 pt-5">
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-[#e7eee8] p-4 text-sm leading-6 text-[#496255]"><CheckCircle className="mt-0.5 shrink-0" size={20} weight="fill" /><span>{message}<span className="block text-xs">来源：{snapshotTransport === "OFFLINE_PACK" ? "本机验签离线包" : "在线正式快照"} · 路网 {snapshot.networkRevision} · 运营版本 {snapshot.operationalVersion} · 有效至 {new Date(snapshot.expiresAt).toLocaleString("zh-CN", { hour12: false })}</span></span></div>

        {destinations.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[#173f35]/20 p-5 text-sm leading-6 text-[#61716a]">当前发布包没有目的节点。管理员需要先把已核验 POI 绑定到路网节点，游客端才会开放规划。</div> : <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor="formal-origin" className="text-sm font-semibold text-[#173f35]">起点</label>
              <select id="formal-origin" value={originNodeId} onChange={(event) => { setRecommendedRouteId(""); setOriginNodeId(event.target.value); discardCurrentPlan(); }} className="min-h-12 w-full rounded-xl border border-[#173f35]/18 bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]">
                {snapshot.routeNetwork.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}
              </select>
              <button type="button" onClick={() => locateFromDevice("MANUAL")} disabled={locating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-3 text-sm font-medium text-[#173f35] outline-none transition-transform active:scale-[.98] disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Crosshair size={18} />{locating ? "正在定位" : "用当前位置匹配正式节点"}</button>
              <p className="text-[11px] leading-5 text-[#718078]">定位权限：{locationPermission === "CHECKING" ? "检查中" : locationPermission === "GRANTED" ? "已允许，进入正式路网后自动定位" : locationPermission === "PROMPT" ? "等待你主动授权" : locationPermission === "DENIED" ? "已拒绝，可手动选择起点" : "浏览器不支持权限预检，可点按钮定位"}</p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="formal-destination" className="text-sm font-semibold text-[#173f35]">目的地</label>
              <select id="formal-destination" value={destinationNodeId} onChange={(event) => { setRecommendedRouteId(""); setDestinationNodeId(event.target.value); discardCurrentPlan(); }} className="min-h-12 w-full rounded-xl border border-[#173f35]/18 bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]">
                {destinations.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}
              </select>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#173f35]/12 bg-white px-3 text-sm"><input type="checkbox" checked={stepFree} onChange={(event) => { setStepFree(event.target.checked); discardCurrentPlan(); }} className="size-5 accent-[#173f35]" /><span>需要无台阶且已核验可达路线</span></label>
            </div>
          </div>

          {recommendedRoutes.length > 0 && <section className="mt-5" aria-labelledby="formal-recommended-routes-title">
            <div className="flex items-end justify-between gap-3">
              <div><h3 id="formal-recommended-routes-title" className="text-sm font-semibold text-[#173f35]">管理员推荐路线</h3><p className="mt-1 text-[11px] leading-5 text-[#68766e]">来自当前正式路网版本，点击后仍会逐段检查封路、难度、无障碍和交通可用性。</p></div>
              <span className="shrink-0 text-[10px] font-semibold text-[#76551f]">{recommendedRoutes.length} 条</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recommendedRoutes.map((route) => {
                const active = route.id === recommendedRouteId;
                return <button key={route.id} type="button" aria-pressed={active} onClick={() => handleRecommendedRoute(route)} className={`min-h-24 rounded-2xl border p-3 text-left outline-none transition-transform active:scale-[.98] focus-visible:ring-3 focus-visible:ring-[#b88a43] ${active ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/14 bg-white text-[#173f35]"}`}>
                  <strong className="block text-sm">{route.name}</strong>
                  <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/75" : "text-[#68766e]"}`}>{formatRemainingDistance(route.distanceMeters)} · 约 {Math.ceil(route.estimatedMinutes)} 分钟 · {route.segments.length} 段</span>
                  <span className={`mt-1 block text-[10px] ${active ? "text-white/60" : "text-[#76551f]"}`}>{route.traversalModes.map((mode) => mode === "WALKWAY" ? "步道" : mode === "BOARDWALK" ? "栈道" : mode === "MOUNTAIN_TRAIL" ? "山路" : mode === "STAIRS" ? "台阶" : mode === "CABLEWAY" ? "索道" : "观光车").join(" · ")}</span>
                </button>;
              })}
            </div>
          </section>}

          {snapshotTransport === "ONLINE" ? <SmartScenicItineraryPlanner
            scenicAreaId={scenicAreaId}
            networkRevision={snapshot.networkRevision}
            operationalVersion={snapshot.operationalVersion}
            originNodeId={originNodeId}
             exitNodeId={itineraryExitNodeId}
             stepFree={stepFree}
             allowCableway={allowCableway}
             allowShuttle={allowShuttle}
             maximumDifficulty={maximumDifficulty}
            onUseSegment={useItinerarySegment}
          /> : <div className="mt-5 rounded-2xl border border-[#b88a43]/20 bg-[#fff8e9] p-4 text-xs leading-5 text-[#725929]">离线状态只开放当前验签路网内的单段确定性规划。AI 多站行程、社区动态与好友位置需要联网，不会用旧数据冒充实时结果。</div>}

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-[#173f35]">路线偏好</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {STRATEGIES.map((strategy) => <button key={strategy.value} type="button" role="radio" aria-checked={optimization === strategy.value && !recommendedRouteId} onClick={() => { setRecommendedRouteId(""); setOptimization(strategy.value); discardCurrentPlan(); }} className={`min-h-20 rounded-2xl border p-3 text-left outline-none transition-transform active:scale-[.98] focus-visible:ring-3 focus-visible:ring-[#b88a43] ${optimization === strategy.value && !recommendedRouteId ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/14 bg-white text-[#173f35]"}`}><strong className="block text-sm">{strategy.label}</strong><span className={`mt-1 block text-xs leading-5 ${optimization === strategy.value && !recommendedRouteId ? "text-white/75" : "text-[#68766e]"}`}>{strategy.description}</span></button>)}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><label htmlFor="formal-pace" className="text-sm font-semibold text-[#173f35]">游览节奏</label><select id="formal-pace" value={pace} onChange={(event) => { setPace(event.target.value as DirectedRoutePreference["pace"]); discardCurrentPlan(); }} className="min-h-12 rounded-xl border border-[#173f35]/18 bg-white px-3 text-sm"><option value="RELAXED">轻松</option><option value="BALANCED">均衡</option><option value="ACTIVE">活力</option></select></div>
            <div className="grid gap-2"><label htmlFor="formal-difficulty" className="text-sm font-semibold text-[#173f35]">可接受最高难度</label><select id="formal-difficulty" value={maximumDifficulty} onChange={(event) => { setMaximumDifficulty(event.target.value as DirectedRoutePreference["maximumDifficulty"]); discardCurrentPlan(); }} className="min-h-12 rounded-xl border border-[#173f35]/18 bg-white px-3 text-sm"><option value="EASY">轻松</option><option value="MODERATE">适中</option><option value="HARD">挑战</option></select></div>
          </div>

          <fieldset className="mt-4 rounded-2xl border border-[#173f35]/12 bg-[#f4f7f3] p-4">
            <legend className="px-1 text-sm font-semibold text-[#173f35]">可接受的景区交通</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#173f35]/10 bg-white px-3 text-sm"><input type="checkbox" checked={allowCableway} onChange={(event) => { setAllowCableway(event.target.checked); discardCurrentPlan(); }} className="size-5 accent-[#173f35]" /><span>允许已核验索道</span></label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#173f35]/10 bg-white px-3 text-sm"><input type="checkbox" checked={allowShuttle} onChange={(event) => { setAllowShuttle(event.target.checked); discardCurrentPlan(); }} className="size-5 accent-[#173f35]" /><span>允许已核验观光车</span></label>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[#68766e]">默认仅规划步行类道路。勾选后也只采用具备服务名称、候乘/乘行时间、HTTPS 班次证据和当前开放快照的交通段；票价与现场排队以运营标识为准。</p>
          </fieldset>

          <button type="button" onClick={() => void createPlan()} disabled={planning || originNodeId === destinationNodeId} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 text-sm font-semibold text-white outline-none transition-transform active:scale-[.98] disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Path size={19} />{planning ? "正在计算正式路线" : "生成正式路线"}</button>
          {plannerMessage && <p role="status" aria-live="polite" className="mt-3 text-xs leading-5 text-[#68766e]">{plannerMessage}</p>}

          {plan && navigationRuntime && <div className="mt-5 rounded-[1.5rem] border border-[#173f35]/14 bg-white p-5" aria-label="正式路线结果">
            <div className="flex items-center gap-2 text-[#173f35]"><Footprints size={21} weight="fill" /><h3 className="text-lg font-semibold">路线已就绪</h3></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><dt className="text-xs text-[#718078]">距离</dt><dd className="mt-1 text-xl font-semibold text-[#173f35]">{plan.distanceMeters >= 1000 ? `${(plan.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(plan.distanceMeters)} m`}</dd></div><div><dt className="text-xs text-[#718078]">预计总耗时</dt><dd className="mt-1 text-xl font-semibold text-[#173f35]">{Math.ceil(plan.estimatedMinutes)} 分钟</dd></div><div><dt className="text-xs text-[#718078]">道路段</dt><dd className="mt-1 text-xl font-semibold text-[#173f35]">{plan.edgeIds.length}</dd></div><div><dt className="text-xs text-[#718078]">动态因素</dt><dd className="mt-1 text-sm font-semibold text-[#173f35]">{plan.dynamicFactorsApplied ? "已应用" : "部分未核验"}</dd></div></dl>
            {plan.traversals.some((traversal) => traversal.kind === "EDGE" && traversal.operationalFactors && (traversal.operationalFactors.travelTimeMultiplier !== 1 || traversal.operationalFactors.crowdLevel !== "UNKNOWN" || !["NONE", "UNKNOWN"].includes(traversal.operationalFactors.weatherImpact))) && <div className="mt-4 rounded-xl border border-[#2f7d62]/20 bg-[#eef7f1] p-3 text-xs leading-5 text-[#315e4f]">
              <strong className="block text-[#173f35]">经复核的短时动态因素</strong>
              <p className="mt-1 text-[#597068]">以下值来自当前正式运营快照，并已计入预计耗时；到期或版本变化时路线会重新规划。</p>
              {plan.traversals.flatMap((traversal) => traversal.kind === "EDGE" && traversal.operationalFactors && (traversal.operationalFactors.travelTimeMultiplier !== 1 || traversal.operationalFactors.crowdLevel !== "UNKNOWN" || !["NONE", "UNKNOWN"].includes(traversal.operationalFactors.weatherImpact)) ? [traversal] : []).map((traversal) => <div key={`factor-${traversal.edgeId}-${traversal.traversalDirection}`} className="mt-2">
                路段 {traversal.edgeId}：耗时 ×{traversal.operationalFactors!.travelTimeMultiplier}，客流 {CROWD_FACTOR_LABELS[traversal.operationalFactors!.crowdLevel]}，天气 {WEATHER_FACTOR_LABELS[traversal.operationalFactors!.weatherImpact]}。
              </div>)}
            </div>}
            {plan.traversals.some((traversal) => traversal.kind === "EDGE" && traversal.transportService) && <div className="mt-4 rounded-xl border border-[#b88a43]/20 bg-[#fff8e9] p-3 text-xs leading-5 text-[#725929]">
              <strong className="block text-[#173f35]">景区交通段</strong>
              {plan.traversals.flatMap((traversal) => traversal.kind === "EDGE" && traversal.transportService ? [traversal] : []).map((traversal) => <div key={`${traversal.edgeId}-${traversal.traversalDirection}`} className="mt-2">
                {traversal.traversalMode === "CABLEWAY" ? "索道" : "观光车"} · {traversal.transportService!.serviceName}：登乘与预计候乘 {Math.ceil(traversal.transportService!.boardingMinutes + traversal.transportService!.expectedWaitMinutes)} 分钟，乘行 {Math.ceil(traversal.transportService!.inVehicleMinutes)} 分钟。
                <a href={traversal.transportService!.scheduleEvidenceReference} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline underline-offset-2">班次证据</a>
              </div>)}
            </div>}
            {plan.notices.length > 0 && <ul className="mt-4 space-y-1 border-t border-[#173f35]/10 pt-4 text-xs leading-5 text-[#725929]">{plan.notices.map((notice) => <li key={notice}>· {NOTICE_LABELS[notice] ?? notice}</li>)}</ul>}

            <section
              className="mt-5 overflow-hidden rounded-[1.4rem] border border-[#173f35]/12 bg-[#f4f7f3]"
              aria-label="实时正式导航"
              data-formal-page-lifecycle={pageLifecycleState.phase.toLowerCase().replaceAll("_", "-")}
              data-formal-voice-state={globalSpeechMuted
                ? "global-muted"
                : voiceEnabled
                  ? voiceState.toLowerCase()
                  : voiceState === "UNSUPPORTED" ? "unsupported" : "off"}
            >
              <div className="bg-[#173f35] p-4 text-white sm:p-5">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/12" aria-hidden="true">
                    <NavigationArrow
                      size={28}
                      weight="fill"
                      style={{ transform: `rotate(${navigationRuntime.maneuver?.headingDegrees ?? 0}deg)` }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[.13em] text-white/65">{selectedDestination ? nodeLabel(selectedDestination) : "正式目的地"}</p>
                    <h4 className="mt-1 text-xl font-semibold tracking-[-.02em]">
                      {navigationRuntime.maneuver
                        ? MANEUVER_LABELS[navigationRuntime.maneuver.kind]
                        : navigationRuntime.status === "READY"
                          ? "等待开始导航"
                          : navigationRuntime.status === "PAUSED"
                            ? "导航已暂停"
                            : navigationRuntime.status === "REROUTE_REQUIRED"
                              ? automaticRerouteState === "FAILED" ? "自动重算已停止" : "正在自动重算"
                              : navigationRuntime.status === "COMPLETED"
                                ? "已确认到达"
                                : navigationRuntime.status === "CANCELLED"
                                  ? "本次导航已退出"
                                  : "正在等待可靠定位"}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-white/78">{navigationRuntime.message}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/14 pt-4">
                  <div><dt className="text-[11px] text-white/60">剩余距离</dt><dd className="mt-1 text-lg font-semibold">{formatRemainingDistance(navigationRuntime.remainingDistanceMeters)}</dd></div>
                  <div><dt className="text-[11px] text-white/60">预计剩余</dt><dd className="mt-1 text-lg font-semibold">{Math.ceil(navigationRuntime.remainingMinutes)} 分钟</dd></div>
                  <div><dt className="text-[11px] text-white/60">定位状态</dt><dd className="mt-1 text-xs font-semibold leading-5">{GUIDANCE_LABELS[navigationRuntime.guidanceQuality]}</dd></div>
                </dl>
              </div>

              {pageLifecycleState.phase !== "FOREGROUND" && <div role="status" aria-live="polite" className="border-b border-[#b88a43]/20 bg-[#fff8e9] px-4 py-3 text-xs leading-5 text-[#725929]">
                <strong className="block text-sm text-[#173f35]">{formalNavigationPageLifecycleLabel(pageLifecycleState)}</strong>
                <span className="mt-1 block">
                  {pageLifecycleState.phase === "BACKGROUND"
                    ? "连续定位已经停止；仅用于自动重算的最近定位样本已清除，系统不会在后台继续引导。"
                    : pageLifecycleState.phase === "VERIFYING"
                      ? "正在读取当前正式快照。完成前不会恢复定位、方向箭头或下一步指令。"
                      : pageLifecycleState.phase === "READY_TO_RESUME"
                        ? "路线版本仍有效，但不会自动恢复。确认后系统会重新启动前台定位，并等待新的可靠样本。"
                        : "当前正式版本无法证明可以继续，旧路线不会因页面恢复而自动启用。"}
                </span>
              </div>}

              <FormalNavigationMap
                key={plan.routeFingerprint}
                plan={plan}
                position={livePosition}
                headingDegrees={navigationRuntime.maneuver?.headingDegrees ?? null}
                guidanceQuality={navigationRuntime.guidanceQuality}
                routeMatch={routeMatch}
                companions={travelGroupMembers}
                offlineMapBundle={snapshotTransport === "OFFLINE_PACK" ? offlineMapBundle : null}
              />

              <div className="px-4">
                {snapshotTransport === "ONLINE" && <FormalAlongRouteRecommendations
                  plan={plan}
                  nodes={snapshot.routeNetwork.nodes}
                  progressRatio={navigationRuntime.progressRatio}
                />}
              </div>

              <div className="grid gap-2 p-4 sm:grid-cols-3">
                {(navigationRuntime.status === "READY" || navigationRuntime.status === "PAUSED") && <button type="button" onClick={() => void startOrResumeNavigation()} disabled={navigationBusy || formalNavigationPageLifecycleBlocksActivation(pageLifecycleState) || geolocationPermissionBlocksActivation(locationPermission)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white outline-none active:scale-[.98] disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Play size={18} weight="fill" />{navigationBusy ? "正在核验" : locationPermission === "DENIED" ? "等待重新允许定位" : pageLifecycleState.phase === "BACKGROUND" ? "等待回到前台" : pageLifecycleState.phase === "VERIFYING" ? "正在核验前台状态" : navigationRuntime.status === "READY" ? "开始导航" : pageLifecycleState.phase === "READY_TO_RESUME" ? "确认恢复导航" : "恢复导航"}</button>}
                {navigationRuntime.status === "ACTIVE" && <button type="button" onClick={pauseNavigation} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white outline-none active:scale-[.98] focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Pause size={18} weight="fill" />暂停导航</button>}
                {navigationRuntime.status === "REROUTE_REQUIRED" && <button type="button" onClick={retryAutomaticReroute} disabled={planning} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#9b6330] px-4 text-sm font-semibold text-white outline-none active:scale-[.98] disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Path size={18} />{planning ? "正在安全重算" : "重新尝试安全重算"}</button>}
                {(navigationRuntime.status === "COMPLETED" || navigationRuntime.status === "CANCELLED") && <button type="button" onClick={() => void createPlan()} disabled={planning} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white outline-none active:scale-[.98] disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Path size={18} />规划新路线</button>}
                {!(["COMPLETED", "CANCELLED"].includes(navigationRuntime.status)) && <button type="button" onClick={exitNavigation} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-4 text-sm font-semibold text-[#173f35] outline-none active:scale-[.98] focus-visible:ring-3 focus-visible:ring-[#b88a43]"><SignOut size={18} />退出导航</button>}
                <button
                  type="button"
                  onClick={toggleNavigationVoice}
                  aria-pressed={voiceEnabled}
                  disabled={globalSpeechMuted || voiceState === "UNSUPPORTED"}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-4 text-sm font-semibold text-[#173f35] outline-none active:scale-[.98] disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#b88a43]"
                >
                  {voiceEnabled ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}
                  {globalSpeechMuted
                    ? "全局静音已开启"
                    : voiceState === "UNSUPPORTED"
                      ? "浏览器不支持语音"
                      : voiceEnabled ? "关闭导航语音" : "开启导航语音"}
                </button>
                <div className="flex min-h-12 items-center rounded-xl border border-[#173f35]/10 bg-white px-3 text-xs leading-5 text-[#61716a] sm:col-span-1">进度 {Math.round(navigationRuntime.progressRatio * 100)}% · 坐标不落盘</div>
              </div>
              <div role="status" aria-live="polite" className="mx-4 mb-4 rounded-xl border border-[#173f35]/10 bg-white px-3 py-3 text-xs leading-5 text-[#61716a]">
                <strong className="block text-[#173f35]">前台关键语音 · {globalSpeechMuted ? "全局静音" : voiceEnabled ? voiceState === "SPEAKING" ? "正在播报" : voiceState === "FAILED" ? "播放失败" : "已开启" : voiceState === "UNSUPPORTED" ? "不可用" : "已关闭"}</strong>
                <span className="mt-1 block">{voiceMessage}</span>
                <span className="mt-1 block text-[11px] text-[#718078]">只使用当前路线指纹、正式路段与可靠前台定位生成提示；后台、暂停、低精度、偏航或版本失效会先取消旧播报。不会录音、上传语音或保存播报时序。</span>
              </div>
              <p className="px-4 pb-4 text-[11px] leading-5 text-[#718078]">导航历史：{snapshotTransport === "OFFLINE_PACK" ? "离线过程不写入账号历史" : navigationHistoryState === "SYNCED" ? "已保存路线版本与 50 米进度档位" : navigationHistoryState === "SAVING" ? "正在保存粗粒度状态" : navigationHistoryState === "AUTH_REQUIRED" ? "未登录，仅保留本机导航" : navigationHistoryState === "CONFLICT" ? "版本冲突，已停止同步" : navigationHistoryState === "UNAVAILABLE" ? "服务未启用，仅保留本机导航" : "开始后按账号设置保存"}；不会上传坐标、朝向或轨迹。</p>
            </section>
            <p className="mt-4 text-[11px] leading-5 text-[#718078]">路线指纹 {plan.routeFingerprint}。开始前和导航中持续核验运营版本；确认偏航或版本变化时先停止旧指令，再用本机新鲜定位匹配正式节点并确定性重算。无法形成新路线时保持停止，不会回退到候选道路。</p>
          </div>}
        </>}
      </div>}
    </section>
  );
}
