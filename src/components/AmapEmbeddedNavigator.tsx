"use client";

import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  ArrowsInSimple,
  ArrowsOutSimple,
  CheckCircle,
  Crosshair,
  Lightbulb,
  LightbulbFilament,
  MapPin,
  NavigationArrow,
  Pause,
  Play,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  findAmapAlongRouteRecommendations,
  sampleAmapRouteCenters,
  type AmapAlongRoutePoi,
} from "@/lib/amap-along-route";
import { AmapAlongRouteCommunityPreview } from "@/components/AmapAlongRouteCommunityPreview";
import { AmapUnavailableError, loadOfficialAmap } from "@/lib/amap-loader.client";
import type {
  AmapCircleOverlay,
  AmapCoordinate,
  AmapLngLat,
  AmapMap,
  AmapMarkerOverlay,
  AmapNamespace,
  AmapOverlay,
  AmapRoutePath,
  AmapRoutePlanner,
  AmapRouteStep,
} from "@/lib/amap-types";
import { buildAmapExternalNavigationUrl, type AmapNavigationMode } from "@/lib/amap-navigation";
import {
  clearAmapRouteSession,
  readAmapRouteSession,
  saveAmapRouteSession,
} from "@/lib/amap-route-session";
import { wgs84ToGcj02 } from "@/lib/gcj02";
import {
  readTravelGroupMapMembersEvent,
  TRAVEL_GROUP_MAP_MEMBERS_EVENT,
  type TravelGroupMapMember,
} from "@/lib/travel-group-map-events";

export type EmbeddedNavigationDestination = {
  id: string;
  name: string;
  coordinate: AmapCoordinate;
  entranceCoordinate: AmapCoordinate | null;
};

type NavigationPhase = "loading-map" | "idle" | "locating" | "planning" | "ready" | "navigating" | "paused" | "arrived" | "error";
type LocationQuality = "idle" | "locating" | "accurate" | "degraded" | "denied" | "unavailable";
type LocationSampleDecision = "accepted" | "low-accuracy" | "stale" | "jump";

type NavigationStep = {
  instruction: string;
  road: string | null;
  distance: number;
  duration: number;
  path: AmapCoordinate[];
};

type RouteSummary = {
  distance: number;
  duration: number;
};

type RoutePoint = {
  coordinate: AmapCoordinate;
  stepIndex: number;
};

type AcceptedLocationSample = {
  coordinate: AmapCoordinate;
  accuracy: number;
  timestamp: number;
};

type AlongRouteLookup = {
  available: boolean;
  message: string;
  pois: AmapAlongRoutePoi[];
};

type AlongRouteRecommendationState = "idle" | "loading" | "ready" | "unavailable";
type WakeLockState = "unsupported" | "idle" | "requesting" | "active" | "released" | "failed";
type RouteRecoveryState = "none" | "restored";

const OFF_ROUTE_METERS = 60;
const RECALCULATE_SAMPLE_COUNT = 3;
const RECALCULATE_COOLDOWN_MS = 15_000;
const ARRIVAL_SAMPLE_COUNT = 2;
const MAX_ARRIVAL_ACCURACY_METERS = 50;
const MAX_PROGRESS_ACCURACY_METERS = 65;
const MAX_ACCURACY_CIRCLE_METERS = 2_000;
const MAX_LOCATION_SAMPLE_AGE_MS = 20_000;
const MAX_WALKING_SAMPLE_SPEED_MPS = 12;
const MAX_DRIVING_SAMPLE_SPEED_MPS = 70;
const JUMP_CONFIRMATION_SAMPLES = 3;

function toCoordinate(point: AmapLngLat): AmapCoordinate {
  return [point.getLng(), point.getLat()];
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "--";
  if (meters === 0) return "0 米";
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} 公里`;
  return `${Math.max(1, Math.round(meters))} 米`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds === 0) return "已到达";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function haversineMeters(a: AmapCoordinate, b: AmapCoordinate) {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitude1 = a[1] * radians;
  const latitude2 = b[1] * radians;
  const deltaLatitude = (b[1] - a[1]) * radians;
  const deltaLongitude = (b[0] - a[0]) * radians;
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function parseSteps(route: AmapRoutePath): NavigationStep[] {
  return (route.steps ?? []).map((step: AmapRouteStep, index) => ({
    instruction: step.instruction?.trim() || step.action?.trim() || `继续前往目的地（第 ${index + 1} 段）`,
    road: step.road?.trim() || null,
    distance: Number(step.distance) || 0,
    duration: Number(step.time) || 0,
    path: (step.path ?? []).map(toCoordinate),
  }));
}

function flattenRoute(steps: NavigationStep[]): RoutePoint[] {
  return steps.flatMap((step, stepIndex) => step.path.map((coordinate) => ({ coordinate, stepIndex })));
}

function nearestRoutePoint(current: AmapCoordinate, points: RoutePoint[]) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = haversineMeters(current, point.coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distance: bestDistance };
}

function remainingGeometryDistance(points: RoutePoint[], fromIndex: number) {
  if (fromIndex < 0) return 0;
  let distance = 0;
  for (let index = fromIndex; index < points.length - 1; index += 1) {
    distance += haversineMeters(points[index].coordinate, points[index + 1].coordinate);
  }
  return distance;
}

function headingLabel(heading: number | null) {
  if (heading === null || !Number.isFinite(heading)) return null;
  const labels = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return labels[Math.round((heading % 360) / 45) % 8];
}

function makeLocationMarker() {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-label", "我的当前位置");
  wrapper.style.position = "relative";
  wrapper.style.width = "40px";
  wrapper.style.height = "40px";

  const halo = document.createElement("div");
  halo.style.position = "absolute";
  halo.style.inset = "7px";
  halo.style.borderRadius = "999px";
  halo.style.background = "#1677ff";
  halo.style.border = "4px solid white";
  halo.style.boxShadow = "0 0 0 8px rgba(22,119,255,.18), 0 3px 12px rgba(0,0,0,.25)";

  const arrow = document.createElement("div");
  arrow.dataset.headingArrow = "true";
  arrow.style.position = "absolute";
  arrow.style.left = "14px";
  arrow.style.top = "-5px";
  arrow.style.width = "12px";
  arrow.style.height = "18px";
  arrow.style.background = "#1677ff";
  arrow.style.clipPath = "polygon(50% 0, 100% 100%, 50% 76%, 0 100%)";
  arrow.style.transformOrigin = "50% 25px";
  arrow.style.filter = "drop-shadow(0 1px 1px rgba(255,255,255,.9))";
  arrow.style.display = "none";

  wrapper.append(arrow, halo);
  return wrapper;
}

function makeAlongRouteMarker(index: number, name: string) {
  const marker = document.createElement("div");
  marker.title = `沿途推荐：${name}`;
  marker.setAttribute("aria-label", `沿途推荐 ${index + 1}：${name}`);
  marker.style.display = "grid";
  marker.style.width = "30px";
  marker.style.height = "30px";
  marker.style.placeItems = "center";
  marker.style.border = "3px solid white";
  marker.style.borderRadius = "999px";
  marker.style.background = "#b88a43";
  marker.style.color = "white";
  marker.style.boxShadow = "0 4px 14px rgba(67,54,31,.28)";
  marker.style.fontSize = "12px";
  marker.style.fontWeight = "750";
  marker.textContent = String(index + 1);
  return marker;
}

function geolocationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "定位权限被拒绝，请在浏览器地址栏开启位置权限。";
  if (error.code === error.POSITION_UNAVAILABLE) return "暂时无法取得当前位置，请移动到开阔处后重试。";
  return "定位超时，请检查系统定位服务后重试。";
}

export function AmapEmbeddedNavigator({
  destination,
  mode,
}: {
  destination: EmbeddedNavigationDestination;
  mode: AmapNavigationMode;
}) {
  const panelId = `amap-route-panel-${useId().replace(/:/g, "")}`;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const amapRef = useRef<AmapNamespace | null>(null);
  const mapRef = useRef<AmapMap | null>(null);
  const routePlannerRef = useRef<AmapRoutePlanner | null>(null);
  const locationMarkerRef = useRef<AmapMarkerOverlay | null>(null);
  const locationMarkerElementRef = useRef<HTMLElement | null>(null);
  const accuracyCircleRef = useRef<AmapCircleOverlay | null>(null);
  const alongRouteMarkersRef = useRef<AmapMarkerOverlay[]>([]);
  const companionMarkersRef = useRef<AmapMarkerOverlay[]>([]);
  const traveledRouteOverlayRef = useRef<AmapOverlay | null>(null);
  const remainingRouteOverlayRef = useRef<AmapOverlay | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const currentCoordinateRef = useRef<AmapCoordinate | null>(null);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const routeSummaryRef = useRef<RouteSummary | null>(null);
  const destinationRef = useRef(destination);
  const modeRef = useRef(mode);
  const phaseRef = useRef<NavigationPhase>("loading-map");
  const locationQualityRef = useRef<LocationQuality>("idle");
  const onlineRef = useRef(true);
  const pausedByLifecycleRef = useRef(false);
  const autoLocateAttemptedRef = useRef(false);
  const offRouteSamplesRef = useRef(0);
  const lastRecalculationRef = useRef(0);
  const arrivalSamplesRef = useRef(0);
  const jumpSamplesRef = useRef(0);
  const lastAcceptedLocationRef = useRef<AcceptedLocationSample | null>(null);
  const planRouteRef = useRef<(origin: AmapCoordinate, recalculate?: boolean) => void>(() => undefined);
  const spokenInstructionRef = useRef("");
  const speechTokenRef = useRef(0);
  const speechOwnedRef = useRef(false);
  const alongRouteRequestRef = useRef(0);
  const companionMarkerRequestRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockPreferredRef = useRef(true);

  const [phase, setPhaseState] = useState<NavigationPhase>("loading-map");
  const [message, setMessage] = useState("正在加载高德地图…");
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState<number | null>(null);
  const [remainingDuration, setRemainingDuration] = useState<number | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [locationQuality, setLocationQuality] = useState<LocationQuality>("idle");
  const [online, setOnline] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<AmapCoordinate[]>([]);
  const [routePointIndex, setRoutePointIndex] = useState(0);
  const [alongRoutePois, setAlongRoutePois] = useState<AmapAlongRoutePoi[]>([]);
  const [alongRouteState, setAlongRouteState] = useState<AlongRouteRecommendationState>("idle");
  const [alongRouteMessage, setAlongRouteMessage] = useState("路线生成后，将查找真正位于路线走廊内的公开地点。");
  const [companions, setCompanions] = useState<TravelGroupMapMember[]>([]);
  const [wakeLockState, setWakeLockState] = useState<WakeLockState>("idle");
  const [wakeLockPreferred, setWakeLockPreferred] = useState(true);
  const [routeRecoveryState, setRouteRecoveryState] = useState<RouteRecoveryState>("none");

  const setPhase = useCallback((next: NavigationPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const setLocationStatus = useCallback((next: LocationQuality, nextMessage?: string) => {
    locationQualityRef.current = next;
    setLocationQuality(next);
    if (nextMessage) setMessage(nextMessage);
  }, []);

  const destinationCoordinate = useMemo(
    () => destination.entranceCoordinate ?? destination.coordinate,
    [destination.coordinate, destination.entranceCoordinate],
  );

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const stopSpeech = useCallback(() => {
    speechTokenRef.current += 1;
    if (speechOwnedRef.current && "speechSynthesis" in window) window.speechSynthesis.cancel();
    speechOwnedRef.current = false;
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    setWakeLockState((current) => current === "unsupported" ? current : "released");
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      setWakeLockState("unsupported");
      return;
    }
    if (document.visibilityState !== "visible") {
      setWakeLockState("released");
      return;
    }
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      setWakeLockState("active");
      return;
    }
    setWakeLockState("requesting");
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (phaseRef.current !== "navigating" || !wakeLockPreferredRef.current || document.visibilityState !== "visible") {
        await sentinel.release();
        setWakeLockState("released");
        return;
      }
      wakeLockRef.current = sentinel;
      setWakeLockState("active");
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        setWakeLockState((current) => current === "unsupported" ? current : "released");
      }, { once: true });
    } catch {
      setWakeLockState("failed");
    }
  }, []);

  const updateLocationMarker = useCallback((coordinate: AmapCoordinate, accuracy?: number) => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map) return;
    currentCoordinateRef.current = coordinate;
    setLocationAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy as number) : null);
    if (Number.isFinite(accuracy) && (accuracy as number) > 0) {
      const radius = Math.min(MAX_ACCURACY_CIRCLE_METERS, Math.max(1, accuracy as number));
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setCenter(coordinate);
        accuracyCircleRef.current.setRadius(radius);
      } else {
        accuracyCircleRef.current = new amap.Circle({
          center: coordinate,
          radius,
          strokeColor: "#1677ff",
          strokeOpacity: 0.48,
          strokeWeight: 1.5,
          fillColor: "#1677ff",
          fillOpacity: 0.1,
          zIndex: 350,
        });
        map.add(accuracyCircleRef.current);
      }
    }
    if (locationMarkerRef.current) {
      locationMarkerRef.current.setPosition(coordinate);
    } else {
      const markerElement = makeLocationMarker();
      locationMarkerElementRef.current = markerElement;
      locationMarkerRef.current = new amap.Marker({
        position: coordinate,
        content: markerElement,
        anchor: "center",
        zIndex: 500,
      });
      map.add(locationMarkerRef.current);
    }
  }, []);

  const updateHeading = useCallback((value: number | null) => {
    if (value === null || !Number.isFinite(value)) return;
    const normalized = (value + 360) % 360;
    const rounded = Math.round(normalized);
    setHeading((current) => current === rounded ? current : rounded);
    const arrow = locationMarkerElementRef.current?.querySelector<HTMLElement>("[data-heading-arrow]");
    if (arrow) {
      arrow.style.display = "block";
      arrow.style.transform = `rotate(${rounded}deg)`;
    }
    if (phaseRef.current === "navigating") {
      mapRef.current?.setRotation((360 - rounded) % 360);
    }
  }, []);

  const evaluateLocationSample = useCallback((
    coordinate: AmapCoordinate,
    accuracy: number,
    timestamp: number,
  ): LocationSampleDecision => {
    if (!Number.isFinite(timestamp) || timestamp < Date.now() - MAX_LOCATION_SAMPLE_AGE_MS || timestamp > Date.now() + 5_000) {
      setLocationStatus("degraded", "收到过期定位，已停止推进路线并等待新位置。");
      return "stale";
    }
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_PROGRESS_ACCURACY_METERS) {
      setLocationStatus("degraded", Number.isFinite(accuracy)
        ? `当前定位误差约 ${Math.round(accuracy)} 米，路线进度暂不更新。`
        : "当前定位没有提供有效精度，路线进度暂不更新。");
      return "low-accuracy";
    }

    const previous = lastAcceptedLocationRef.current;
    if (previous) {
      const elapsedSeconds = Math.max(0.001, (timestamp - previous.timestamp) / 1_000);
      const distance = haversineMeters(previous.coordinate, coordinate);
      const impliedSpeed = distance / elapsedSeconds;
      const speedLimit = modeRef.current === "walk" ? MAX_WALKING_SAMPLE_SPEED_MPS : MAX_DRIVING_SAMPLE_SPEED_MPS;
      const uncertaintyAllowance = Math.max(previous.accuracy, accuracy) * 2 + 25;
      const suspicious = elapsedSeconds <= 60 && distance > uncertaintyAllowance && impliedSpeed > speedLimit;
      if (suspicious) {
        jumpSamplesRef.current += 1;
        if (jumpSamplesRef.current < JUMP_CONFIRMATION_SAMPLES) {
          setLocationStatus("degraded", "检测到定位跳点，已冻结地图进度并等待连续位置确认。");
          return "jump";
        }
      }
    }

    jumpSamplesRef.current = 0;
    lastAcceptedLocationRef.current = { coordinate, accuracy, timestamp };
    const recovered = locationQualityRef.current === "degraded" || locationQualityRef.current === "unavailable";
    setLocationStatus("accurate", recovered && phaseRef.current === "navigating" ? "定位已恢复，继续实时导航。" : undefined);
    return "accepted";
  }, [setLocationStatus]);

  const convertGpsCoordinate = useCallback((coordinate: AmapCoordinate) => new Promise<AmapCoordinate>((resolve) => {
    const amap = amapRef.current;
    if (!amap) {
      resolve(wgs84ToGcj02(coordinate));
      return;
    }
    amap.convertFrom(coordinate, "gps", (status, result) => {
      if (status === "complete" && typeof result !== "string" && result.locations?.[0]) {
        resolve(toCoordinate(result.locations[0]));
      } else {
        resolve(wgs84ToGcj02(coordinate));
      }
    });
  }), []);

  const locateOnce = useCallback(() => new Promise<AmapCoordinate>((resolve, reject) => {
    const amap = amapRef.current;
    if (!amap?.Geolocation) {
      reject(new Error("GEOLOCATION_PLUGIN_UNAVAILABLE"));
      return;
    }
    const geolocation = new amap.Geolocation({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 3_000,
      convert: true,
      showButton: false,
      showMarker: false,
      showCircle: false,
      panToLocation: false,
      zoomToAccuracy: false,
    });
    geolocation.getCurrentPosition((status, result) => {
      if (status === "complete" && typeof result !== "string" && result.position) {
        const coordinate = toCoordinate(result.position);
        const accuracy = Number(result.accuracy);
        updateLocationMarker(coordinate, accuracy);
        if (Number.isFinite(accuracy) && accuracy > 0 && accuracy <= MAX_PROGRESS_ACCURACY_METERS) {
          lastAcceptedLocationRef.current = { coordinate, accuracy, timestamp: Date.now() };
          setLocationStatus("accurate");
        } else {
          setLocationStatus("degraded", Number.isFinite(accuracy)
            ? `已取得当前位置，但误差约 ${Math.round(accuracy)} 米；开始导航后将等待更可靠定位。`
            : "已取得大致位置；开始导航后将等待更可靠定位。");
        }
        resolve(coordinate);
      } else {
        const failure = typeof result === "string" ? result : result.message || "定位失败";
        setLocationStatus("unavailable", failure);
        reject(new Error(failure));
      }
    });
  }), [setLocationStatus, updateLocationMarker]);

  const loadAlongRoutePois = useCallback(async (points: RoutePoint[]) => {
    const requestId = alongRouteRequestRef.current + 1;
    alongRouteRequestRef.current = requestId;
    const centers = sampleAmapRouteCenters(points.map((point) => point.coordinate));
    setAlongRoutePois([]);
    if (!centers.length) {
      setAlongRouteState("unavailable");
      setAlongRouteMessage("高德本次路线没有提供足够几何，暂不生成沿途推荐。主导航不受影响。");
      return;
    }
    setAlongRouteState("loading");
    setAlongRouteMessage("正在查询路线采样点周边的高德公开地点…");
    try {
      const response = await fetch("/api/map/along-route", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centers }),
      });
      const result = await response.json() as AlongRouteLookup;
      if (requestId !== alongRouteRequestRef.current) return;
      if (!response.ok || !result.available || !Array.isArray(result.pois)) {
        setAlongRouteState("unavailable");
        setAlongRouteMessage(result.message || "沿途公开地点暂不可用，主导航不受影响。");
        return;
      }
      setAlongRoutePois(result.pois);
      setAlongRouteState("ready");
      setAlongRouteMessage(result.message);
    } catch {
      if (requestId !== alongRouteRequestRef.current) return;
      setAlongRouteState("unavailable");
      setAlongRouteMessage("沿途公开地点暂时读取失败，主导航仍可继续使用。");
    }
  }, []);

  const planRoute = useCallback((origin: AmapCoordinate, recalculate = false) => {
    if (!onlineRef.current) {
      if (recalculate) setPhase("paused");
      setMessage(recalculate
        ? "当前无网络，无法重新规划；导航已暂停，请回到路线或等待网络恢复。"
        : "当前无网络，无法请求新的高德路线。已有路线仍会保留。 ");
      return;
    }
    const amap = amapRef.current;
    const map = mapRef.current;
    const currentDestination = destinationRef.current;
    const target = currentDestination.entranceCoordinate ?? currentDestination.coordinate;
    if (!amap || !map) return;
    const Planner = modeRef.current === "walk" ? amap.Walking : amap.Driving;
    if (!Planner) {
      setPhase("error");
      setMessage("高德路线组件没有成功加载，请刷新页面重试。");
      return;
    }

    routePlannerRef.current?.clear();
    const planner = new Planner({
      map,
      panel: panelId,
      autoFitView: !recalculate,
      hideMarkers: false,
      isOutline: true,
      outlineColor: "#ffffff",
      showTraffic: modeRef.current === "car",
    });
    routePlannerRef.current = planner;
    if (!recalculate) setPhase("planning");
    setMessage(recalculate ? "检测到偏航，正在重新规划路线…" : "高德正在计算路线…");

    planner.search(origin, target, (status, result) => {
      if (planner !== routePlannerRef.current) return;
      if (status !== "complete" || typeof result === "string" || !result.routes?.[0]) {
        setPhase("error");
        setMessage(typeof result === "string" ? result : result.info || "暂时没有找到可用路线。");
        return;
      }
      const route = result.routes[0];
      const parsedSteps = parseSteps(route);
      const nextSummary = {
        distance: Number(route.distance) || parsedSteps.reduce((total, step) => total + step.distance, 0),
        duration: Number(route.time) || parsedSteps.reduce((total, step) => total + step.duration, 0),
      };
      const points = flattenRoute(parsedSteps);
      routePointsRef.current = points;
      setRouteCoordinates(points.map((point) => point.coordinate));
      setRoutePointIndex(0);
      routeSummaryRef.current = nextSummary;
      setRouteRecoveryState("none");
      setSteps(parsedSteps);
      setSummary(nextSummary);
      setRemainingDistance(nextSummary.distance);
      setRemainingDuration(nextSummary.duration);
      setActiveStepIndex(0);
      spokenInstructionRef.current = "";
      offRouteSamplesRef.current = 0;
      arrivalSamplesRef.current = 0;
      void loadAlongRoutePois(points);
      if (recalculate || phaseRef.current === "navigating") {
        setPhase("navigating");
        setMessage("路线已更新，正在导航。");
      } else {
        setPhase("ready");
        setMessage("路线已生成，可以开始导航。");
      }
    });
  }, [loadAlongRoutePois, panelId, setPhase]);

  useEffect(() => {
    planRouteRef.current = planRoute;
  }, [planRoute]);

  const updateProgress = useCallback((coordinate: AmapCoordinate, accuracy?: number) => {
    const points = routePointsRef.current;
    const currentSummary = routeSummaryRef.current;
    if (!points.length || !currentSummary) return;

    const currentDestination = destinationRef.current;
    const target = currentDestination.entranceCoordinate ?? currentDestination.coordinate;
    const destinationDistance = haversineMeters(coordinate, target);
    const arrivalRadius = modeRef.current === "walk" ? 25 : 40;
    const reliableAccuracy = Number.isFinite(accuracy) && (accuracy as number) > 0 && (accuracy as number) <= MAX_ARRIVAL_ACCURACY_METERS;
    if (phaseRef.current === "navigating" && reliableAccuracy && destinationDistance <= arrivalRadius) {
      arrivalSamplesRef.current += 1;
    } else {
      arrivalSamplesRef.current = 0;
    }
    if (arrivalSamplesRef.current >= ARRIVAL_SAMPLE_COUNT) {
      stopWatching();
      releaseWakeLock();
      clearAmapRouteSession(window.sessionStorage);
      setRouteRecoveryState("none");
      setRemainingDistance(0);
      setRemainingDuration(0);
      setActiveStepIndex(Math.max(0, steps.length - 1));
      setPhase("arrived");
      setMessage(`已到达 ${currentDestination.name}。`);
      mapRef.current?.setRotation(0);
      mapRef.current?.setPitch(0);
      mapRef.current?.setCenter(target);
      return;
    }

    const nearest = nearestRoutePoint(coordinate, points);
    if (nearest.index < 0) return;
    setRoutePointIndex(nearest.index);
    const geometryTotal = remainingGeometryDistance(points, 0);
    const geometryRemaining = remainingGeometryDistance(points, nearest.index);
    const ratio = geometryTotal > 0 ? Math.min(1, geometryRemaining / geometryTotal) : 0;
    setRemainingDistance(Math.max(0, currentSummary.distance * ratio));
    setRemainingDuration(Math.max(0, currentSummary.duration * ratio));
    setActiveStepIndex(points[nearest.index].stepIndex);

    if (nearest.distance > OFF_ROUTE_METERS) offRouteSamplesRef.current += 1;
    else offRouteSamplesRef.current = 0;

    const now = Date.now();
    if (
      phaseRef.current === "navigating"
      && offRouteSamplesRef.current >= RECALCULATE_SAMPLE_COUNT
      && now - lastRecalculationRef.current >= RECALCULATE_COOLDOWN_MS
    ) {
      lastRecalculationRef.current = now;
      offRouteSamplesRef.current = 0;
      if (onlineRef.current) {
        planRouteRef.current(coordinate, true);
      } else {
        stopWatching();
        stopSpeech();
        setPhase("paused");
        setMessage("已偏离当前路线，但网络不可用，无法安全重算；导航已暂停。 ");
        mapRef.current?.setRotation(0);
        mapRef.current?.setPitch(0);
      }
    }
  }, [releaseWakeLock, setPhase, steps.length, stopSpeech, stopWatching]);

  const startWatching = useCallback(() => {
    stopWatching();
    if (!navigator.geolocation) {
      setPhase("error");
      setLocationStatus("unavailable", "当前浏览器不支持实时定位。");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void convertGpsCoordinate([position.coords.longitude, position.coords.latitude])
          .then((coordinate) => {
            const decision = evaluateLocationSample(coordinate, position.coords.accuracy, position.timestamp);
            if (decision === "low-accuracy") {
              updateLocationMarker(coordinate, position.coords.accuracy);
              return;
            }
            if (decision !== "accepted") return;
            updateLocationMarker(coordinate, position.coords.accuracy);
            updateHeading(typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading) ? position.coords.heading : null);
            updateProgress(coordinate, position.coords.accuracy);
            if (phaseRef.current === "navigating") mapRef.current?.setCenter(coordinate);
          })
          .catch(() => setMessage("当前位置坐标转换失败，正在等待下一次定位。"));
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setLocationStatus(denied ? "denied" : "unavailable", geolocationMessage(error));
        if (denied) stopWatching();
        if (phaseRef.current === "navigating") {
          setPhase("paused");
          mapRef.current?.setRotation(0);
          mapRef.current?.setPitch(0);
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 2_000 },
    );
  }, [convertGpsCoordinate, evaluateLocationSample, setLocationStatus, setPhase, stopWatching, updateHeading, updateLocationMarker, updateProgress]);

  useEffect(() => {
    const timer = window.setTimeout(() => setVoiceSupported("speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applyConnectivity = () => {
      const previous = onlineRef.current;
      const next = navigator.onLine !== false;
      onlineRef.current = next;
      setOnline(next);
      if (!next && phaseRef.current === "navigating") {
        setMessage("网络已断开；将沿已加载路线继续定位，偏航重算暂不可用。 ");
      } else if (next && !previous) {
        setMessage(phaseRef.current === "paused"
          ? "网络已恢复，可点击继续导航并获取新位置。"
          : "网络已恢复，在线路线重算已经可用。 ");
      }
    };
    applyConnectivity();
    window.addEventListener("online", applyConnectivity);
    window.addEventListener("offline", applyConnectivity);
    return () => {
      window.removeEventListener("online", applyConnectivity);
      window.removeEventListener("offline", applyConnectivity);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    if (!immersive) return () => window.cancelAnimationFrame(frame);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => mapRef.current?.resize());
    };
  }, [immersive]);

  useEffect(() => {
    if (!("permissions" in navigator) || typeof navigator.permissions.query !== "function") return;
    let cancelled = false;
    let permission: PermissionStatus | null = null;
    const applyPermission = () => {
      if (cancelled || !permission) return;
      if (permission.state === "denied") {
        stopWatching();
        stopSpeech();
        setLocationStatus("denied", "定位权限已关闭，请在浏览器地址栏重新允许位置访问。");
        if (phaseRef.current === "navigating") {
          setPhase("paused");
          mapRef.current?.setRotation(0);
          mapRef.current?.setPitch(0);
        }
      } else if (locationQualityRef.current === "denied") {
        setLocationStatus("idle", "位置权限可以重新请求，请点击定位或继续导航。");
      }
    };
    void navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (cancelled) return;
      permission = result;
      applyPermission();
      permission.addEventListener("change", applyPermission);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      permission?.removeEventListener("change", applyPermission);
    };
  }, [setLocationStatus, setPhase, stopSpeech, stopWatching]);

  useEffect(() => {
    const snapshot = readAmapRouteSession(window.sessionStorage, {
      destinationId: destination.id,
      mode,
    });
    if (!snapshot) return;
    const restoredSteps: NavigationStep[] = snapshot.steps.map((step, stepIndex) => ({
      ...step,
      path: snapshot.routePoints
        .filter((point) => point.stepIndex === stepIndex)
        .map((point) => point.coordinate),
    }));
    const restoredPoints: RoutePoint[] = snapshot.routePoints.map((point) => ({
      coordinate: point.coordinate,
      stepIndex: point.stepIndex,
    }));
    const restoreTimer = window.setTimeout(() => {
      routePointsRef.current = restoredPoints;
      routeSummaryRef.current = snapshot.summary;
      setRouteCoordinates(restoredPoints.map((point) => point.coordinate));
      setRoutePointIndex(snapshot.routePointIndex);
      setSteps(restoredSteps);
      setSummary(snapshot.summary);
      setRemainingDistance(snapshot.remainingDistance);
      setRemainingDuration(snapshot.remainingDuration);
      setActiveStepIndex(snapshot.activeStepIndex);
      setAlongRoutePois([]);
      setAlongRouteState("unavailable");
      setAlongRouteMessage("已恢复路线主体；沿途公开地点需要联网重新规划后刷新。");
      setRouteRecoveryState("restored");
      setPhase("paused");
      setMessage(navigator.onLine === false
        ? "已恢复本标签页内的路线；离线时可查看步骤和继续定位，偏航无法重算。"
        : "已恢复本标签页内的路线，点击继续导航即可刷新当前位置。");
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [destination.id, mode, setPhase]);

  useEffect(() => {
    if (
      !summary
      || !["ready", "navigating", "paused"].includes(phase)
      || (routeRecoveryState === "restored" && phase === "paused")
      || !routePointsRef.current.length
      || !steps.length
      || remainingDistance === null
      || remainingDuration === null
    ) return;
    const timer = window.setTimeout(() => {
      saveAmapRouteSession(window.sessionStorage, {
        destinationId: destination.id,
        destinationName: destination.name,
        destinationCoordinate,
        mode,
        savedPhase: phase as "ready" | "navigating" | "paused",
        summary,
        steps: steps.map(({ instruction, road, distance, duration }) => ({ instruction, road, distance, duration })),
        routePoints: routePointsRef.current,
        activeStepIndex,
        routePointIndex,
        remainingDistance,
        remainingDuration,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeStepIndex, destination.id, destination.name, destinationCoordinate, mode, phase, remainingDistance, remainingDuration, routePointIndex, routeRecoveryState, steps, summary]);

  useEffect(() => {
    let disposed = false;
    const container = mapContainerRef.current;
    if (!container) return;
    const hasRestoredRoute = Boolean(routeSummaryRef.current);
    setMapReady(false);
    setMapLoadFailed(false);
    setPhase("loading-map");
    setMessage(hasRestoredRoute ? "路线已恢复，正在重新加载高德底图…" : "正在加载高德地图…");
    void loadOfficialAmap()
      .then((amap) => {
        if (disposed) return;
        amapRef.current = amap;
        const target = destinationRef.current.entranceCoordinate ?? destinationRef.current.coordinate;
        const map = new amap.Map(container, {
          center: target,
          zoom: 15,
          minZoom: 3,
          maxZoom: 20,
          viewMode: "3D",
          pitch: 0,
          rotation: 0,
          mapStyle: "amap://styles/normal",
          features: ["bg", "point", "road", "building"],
          keyboardEnable: true,
          dragEnable: true,
          zoomEnable: true,
          doubleClickZoom: true,
          touchZoom: true,
          showLabel: true,
        });
        mapRef.current = map;
        setMapReady(true);
        if (routeSummaryRef.current) {
          setPhase("paused");
          setMessage("路线与步骤已恢复，点击继续导航即可刷新当前位置。");
        } else {
          setPhase("idle");
          setMessage("地图已就绪，正在自动获取当前位置…");
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (routeSummaryRef.current) {
          setMapLoadFailed(true);
          setPhase("paused");
          setMessage("高德底图暂不可用，已保留路线步骤与剩余信息；偏航重算需联网恢复底图。 ");
        } else {
          setPhase("error");
          setMessage(error instanceof AmapUnavailableError && error.code === "NOT_CONFIGURED"
            ? "高德地图暂未启用。"
            : "高德地图暂时加载失败，请刷新页面重试。");
        }
      });
    return () => {
      disposed = true;
      stopWatching();
      stopSpeech();
      releaseWakeLock();
      routePlannerRef.current?.clear();
      mapRef.current?.destroy();
      mapRef.current = null;
      amapRef.current = null;
      locationMarkerRef.current = null;
      locationMarkerElementRef.current = null;
      accuracyCircleRef.current = null;
      alongRouteMarkersRef.current = [];
      companionMarkersRef.current = [];
      traveledRouteOverlayRef.current = null;
      remainingRouteOverlayRef.current = null;
    };
  }, [releaseWakeLock, setPhase, stopSpeech, stopWatching]);

  useEffect(() => {
    const handleMembers = (event: Event) => {
      const members = readTravelGroupMapMembersEvent(event);
      if (members) setCompanions(members);
    };
    window.addEventListener(TRAVEL_GROUP_MAP_MEMBERS_EVENT, handleMembers);
    return () => window.removeEventListener(TRAVEL_GROUP_MAP_MEMBERS_EVENT, handleMembers);
  }, []);

  useEffect(() => {
    if (!mapReady || routeSummaryRef.current || autoLocateAttemptedRef.current) return;
    autoLocateAttemptedRef.current = true;
    let active = true;
    setPhase("locating");
    setLocationStatus("locating", "正在自动获取高精度位置…");
    void locateOnce()
      .then(() => {
        if (!active) return;
        setPhase("idle");
        setMessage(locationQualityRef.current === "accurate"
          ? "已自动定位当前位置，可以直接生成网站内路线。"
          : "已显示大致位置；生成路线时会再次获取可靠定位。 ");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPhase("idle");
        const failure = error instanceof Error && error.message
          ? error.message
          : "自动定位暂时不可用，可以点击下方按钮重试。";
        if (locationQualityRef.current !== "denied") setLocationStatus("unavailable", failure);
      });
    return () => {
      active = false;
    };
  }, [locateOnce, mapReady, setLocationStatus, setPhase]);

  const handlePlan = useCallback(async () => {
    if (!onlineRef.current) {
      setMessage("当前无网络，无法请求新的高德路线。请联网后再规划。 ");
      return;
    }
    const accepted = lastAcceptedLocationRef.current;
    const existingCoordinate = currentCoordinateRef.current;
    if (
      existingCoordinate
      && accepted
      && locationQualityRef.current === "accurate"
      && accepted.timestamp >= Date.now() - MAX_LOCATION_SAMPLE_AGE_MS
    ) {
      planRoute(existingCoordinate);
      return;
    }
    setPhase("locating");
    setLocationStatus("locating", "正在刷新高精度位置…");
    try {
      const origin = await locateOnce();
      planRoute(origin);
    } catch (error) {
      setPhase("error");
      const failure = error instanceof Error && error.message ? error.message : "定位失败，请检查位置权限后重试。";
      if (locationQualityRef.current !== "denied" && locationQualityRef.current !== "degraded") {
        setLocationStatus("unavailable", failure);
      } else {
        setMessage(failure);
      }
    }
  }, [locateOnce, planRoute, setLocationStatus, setPhase]);

  const handleReplan = useCallback(() => {
    if (!onlineRef.current) {
      setMessage("当前无网络，无法重新规划路线。 ");
      return;
    }
    const coordinate = currentCoordinateRef.current;
    if (!coordinate || locationQualityRef.current !== "accurate") {
      setMessage("需要新的可靠定位后才能重新规划路线。");
      return;
    }
    planRoute(coordinate);
  }, [planRoute]);

  const handleStart = useCallback(() => {
    if (!summary) return;
    pausedByLifecycleRef.current = false;
    arrivalSamplesRef.current = 0;
    jumpSamplesRef.current = 0;
    lastAcceptedLocationRef.current = null;
    setImmersive(true);
    setPhase("navigating");
    setMessage(onlineRef.current
      ? "实时导航已开始；保持本页面在前台可持续更新位置。"
      : "已沿当前加载路线继续导航；网络恢复前无法重新规划。 ");
    const map = mapRef.current;
    map?.setPitch(modeRef.current === "walk" ? 35 : 45);
    if (map) map.setZoom(Math.max(17, map.getZoom()));
    if (wakeLockPreferredRef.current) void requestWakeLock();
    startWatching();
  }, [requestWakeLock, setPhase, startWatching, summary]);

  const handlePause = useCallback(() => {
    pausedByLifecycleRef.current = false;
    stopWatching();
    stopSpeech();
    releaseWakeLock();
    setPhase("paused");
    setMessage("导航已暂停，路线仍保留在地图上。");
    mapRef.current?.setRotation(0);
    mapRef.current?.setPitch(0);
  }, [releaseWakeLock, setPhase, stopSpeech, stopWatching]);

  const handleExit = useCallback(() => {
    pausedByLifecycleRef.current = false;
    stopWatching();
    stopSpeech();
    releaseWakeLock();
    routePlannerRef.current?.clear();
    clearAmapRouteSession(window.sessionStorage);
    setRouteRecoveryState("none");
    setMapLoadFailed(false);
    routePlannerRef.current = null;
    routePointsRef.current = [];
    setRouteCoordinates([]);
    setRoutePointIndex(0);
    routeSummaryRef.current = null;
    setSummary(null);
    setSteps([]);
    setRemainingDistance(null);
    setRemainingDuration(null);
    setActiveStepIndex(0);
    alongRouteRequestRef.current += 1;
    setAlongRoutePois([]);
    setAlongRouteState("idle");
    setAlongRouteMessage("路线生成后，将查找真正位于路线走廊内的公开地点。");
    spokenInstructionRef.current = "";
    arrivalSamplesRef.current = 0;
    jumpSamplesRef.current = 0;
    lastAcceptedLocationRef.current = null;
    setHeading(null);
    const headingArrow = locationMarkerElementRef.current?.querySelector<HTMLElement>("[data-heading-arrow]");
    if (headingArrow) headingArrow.style.display = "none";
    setImmersive(false);
    setPhase("idle");
    setMessage("导航已退出，可以重新规划路线。");
    mapRef.current?.setCenter(destinationCoordinate);
    mapRef.current?.setRotation(0);
    mapRef.current?.setPitch(0);
  }, [destinationCoordinate, releaseWakeLock, setPhase, stopSpeech, stopWatching]);

  useEffect(() => {
    const pauseForBackground = () => {
      if (phaseRef.current !== "navigating") return;
      pausedByLifecycleRef.current = true;
      stopWatching();
      stopSpeech();
      releaseWakeLock();
      lastAcceptedLocationRef.current = null;
      jumpSamplesRef.current = 0;
      arrivalSamplesRef.current = 0;
      setHeading(null);
      const headingArrow = locationMarkerElementRef.current?.querySelector<HTMLElement>("[data-heading-arrow]");
      if (headingArrow) headingArrow.style.display = "none";
      setPhase("paused");
      setLocationStatus("idle", "页面已进入后台，定位和语音已暂停；返回后请主动继续导航。 ");
      mapRef.current?.setRotation(0);
      mapRef.current?.setPitch(0);
    };
    const announceForeground = () => {
      if (!pausedByLifecycleRef.current || document.visibilityState === "hidden") return;
      setMessage(onlineRef.current
        ? "已返回前台，请点击继续导航以获取新的可靠位置。"
        : "已返回前台，但当前无网络；可沿已加载路线继续，无法在线重算。 ");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseForBackground();
      else announceForeground();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", pauseForBackground);
    window.addEventListener("pageshow", announceForeground);
    document.addEventListener("freeze", pauseForBackground);
    document.addEventListener("resume", announceForeground);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", pauseForBackground);
      window.removeEventListener("pageshow", announceForeground);
      document.removeEventListener("freeze", pauseForBackground);
      document.removeEventListener("resume", announceForeground);
    };
  }, [releaseWakeLock, setLocationStatus, setPhase, stopSpeech, stopWatching]);

  const currentStep = steps[activeStepIndex] ?? null;
  const isBusy = phase === "loading-map" || phase === "locating" || phase === "planning";
  const alongRouteRecommendations = useMemo(() => findAmapAlongRouteRecommendations({
    pois: alongRoutePois,
    route: routeCoordinates,
    currentRouteIndex: routePointIndex,
    corridorMeters: mode === "walk" ? 180 : 420,
    excludedPoiId: destination.id,
    limit: 4,
  }), [alongRoutePois, destination.id, mode, routeCoordinates, routePointIndex]);

  useEffect(() => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map || !mapReady) return;

    const previous = [traveledRouteOverlayRef.current, remainingRouteOverlayRef.current]
      .filter((overlay): overlay is AmapOverlay => overlay !== null);
    if (previous.length) map.remove(previous);
    traveledRouteOverlayRef.current = null;
    remainingRouteOverlayRef.current = null;

    if (routeCoordinates.length < 2) return;
    const boundedIndex = Math.min(routeCoordinates.length - 1, Math.max(0, routePointIndex));
    const traveledPath = routeCoordinates.slice(0, boundedIndex + 1);
    const remainingPath = routeCoordinates.slice(boundedIndex);
    if (traveledPath.length >= 2) {
      traveledRouteOverlayRef.current = new amap.Polyline({
        path: traveledPath,
        strokeColor: "#718078",
        strokeOpacity: 0.82,
        strokeWeight: 8,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 460,
      });
    }
    if (remainingPath.length >= 2) {
      remainingRouteOverlayRef.current = new amap.Polyline({
        path: remainingPath,
        strokeColor: "#1677ff",
        strokeOpacity: 0.96,
        strokeWeight: 9,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 470,
      });
    }
    const next = [traveledRouteOverlayRef.current, remainingRouteOverlayRef.current]
      .filter((overlay): overlay is AmapOverlay => overlay !== null);
    if (next.length) map.add(next);
    return () => {
      if (next.length) map.remove(next);
      if (traveledRouteOverlayRef.current === next[0]) traveledRouteOverlayRef.current = null;
      if (remainingRouteOverlayRef.current === next[next.length - 1]) remainingRouteOverlayRef.current = null;
    };
  }, [mapReady, routeCoordinates, routePointIndex]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const coordinate = currentCoordinateRef.current;
    if (!map || !coordinate) {
      setMessage("正在等待可靠定位，取得位置后即可回到当前位置。");
      return;
    }
    map.setCenter(coordinate);
    map.setZoom(Math.max(17, map.getZoom()));
    map.setPitch(phaseRef.current === "navigating" ? modeRef.current === "walk" ? 35 : 45 : 0);
  }, []);

  const handleShowFullRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const overlays = [traveledRouteOverlayRef.current, remainingRouteOverlayRef.current]
      .filter((overlay): overlay is AmapOverlay => overlay !== null);
    map.setRotation(0);
    map.setPitch(0);
    if (overlays.length) map.setFitView(overlays, false, [88, 40, 72, 40], 18);
  }, []);

  useEffect(() => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map || !mapReady) return;
    if (alongRouteMarkersRef.current.length) map.remove(alongRouteMarkersRef.current);
    const markers = alongRouteRecommendations.map((poi, index) => new amap.Marker({
      position: poi.entranceCoordinate ?? poi.coordinate,
      content: makeAlongRouteMarker(index, poi.name),
      anchor: "center",
      zIndex: 460,
    }));
    alongRouteMarkersRef.current = markers;
    if (markers.length) map.add(markers);
    return () => {
      if (alongRouteMarkersRef.current === markers && markers.length) {
        map.remove(markers);
        alongRouteMarkersRef.current = [];
      }
    };
  }, [alongRouteRecommendations, mapReady]);

  useEffect(() => {
    const amap = amapRef.current;
    const map = mapRef.current;
    if (!amap || !map || !mapReady) return;
    const request = companionMarkerRequestRef.current + 1;
    companionMarkerRequestRef.current = request;
    if (companionMarkersRef.current.length) map.remove(companionMarkersRef.current);
    companionMarkersRef.current = [];
    if (!companions.length) return;

    let cancelled = false;
    void Promise.all(companions.map(async (member) => {
      try {
        const coordinate = await convertGpsCoordinate([member.longitude, member.latitude]);
        return { member, coordinate };
      } catch {
        return null;
      }
    })).then((converted) => {
      if (cancelled || companionMarkerRequestRef.current !== request || mapRef.current !== map) return;
      const markers = converted.flatMap((result) => {
        if (!result) return [];
        const content = document.createElement("div");
        content.setAttribute("aria-hidden", "true");
        content.title = `${result.member.displayName} · ${result.member.direction} · 约 ${Math.ceil(result.member.distanceMeters)} 米`;
        Object.assign(content.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px 4px 4px",
          border: "2px solid rgba(255,255,255,.92)",
          borderRadius: "999px",
          background: "rgba(255,253,247,.96)",
          color: "#173f35",
          boxShadow: "0 5px 16px rgba(23,63,53,.25)",
          whiteSpace: "nowrap",
        });
        const avatar = document.createElement("span");
        avatar.textContent = result.member.displayName.trim().slice(0, 1) || "友";
        Object.assign(avatar.style, {
          display: "grid",
          placeItems: "center",
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          background: "#b88a43",
          color: "white",
          fontSize: "12px",
          fontWeight: "800",
        });
        const label = document.createElement("span");
        const distance = result.member.distanceMeters >= 1_000
          ? `${(result.member.distanceMeters / 1_000).toFixed(1)} km`
          : `${Math.ceil(result.member.distanceMeters)} m`;
        label.textContent = `${result.member.displayName} · ${result.member.direction} ${distance}`;
        Object.assign(label.style, { maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", fontSize: "11px", fontWeight: "700" });
        content.append(avatar, label);
        return [new amap.Marker({ position: result.coordinate, content, anchor: "bottom-center", zIndex: 490 })];
      });
      companionMarkersRef.current = markers;
      if (markers.length) map.add(markers);
    });
    return () => {
      cancelled = true;
      companionMarkerRequestRef.current += 1;
      if (companionMarkersRef.current.length) map.remove(companionMarkersRef.current);
      companionMarkersRef.current = [];
    };
  }, [companions, convertGpsCoordinate, mapReady]);

  useEffect(() => {
    if (!voiceEnabled || !voiceSupported) {
      stopSpeech();
      return;
    }
    const speech = phase === "arrived"
      ? { identity: `${destination.id}|arrived`, text: `您已到达${destination.name}` }
      : phase === "navigating" && currentStep
        ? { identity: `${destination.id}|${mode}|${activeStepIndex}|${currentStep.instruction}`, text: currentStep.instruction }
        : null;
    if (!speech) {
      stopSpeech();
      return;
    }
    const identity = speech.identity;
    if (spokenInstructionRef.current === identity) return;
    stopSpeech();
    spokenInstructionRef.current = identity;
    const token = speechTokenRef.current;
    const utterance = new window.SpeechSynthesisUtterance(speech.text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    speechOwnedRef.current = true;
    const release = () => {
      if (speechTokenRef.current === token) speechOwnedRef.current = false;
    };
    utterance.onend = release;
    utterance.onerror = release;
    window.speechSynthesis.speak(utterance);
  }, [activeStepIndex, currentStep, destination.id, destination.name, mode, phase, stopSpeech, voiceEnabled, voiceSupported]);

  const compass = headingLabel(heading);
  const wakeLockPresentation = wakeLockState === "active"
    ? { label: "屏幕常亮", className: "border-[#2f7457]/20 bg-[#e7f2eb] text-[#2f7457]" }
    : wakeLockState === "requesting"
      ? { label: "开启常亮", className: "border-[#1677ff]/20 bg-[#eaf3ff] text-[#2369b8]" }
      : wakeLockState === "unsupported"
        ? { label: "常亮不可用", className: "border-[#173f35]/12 bg-[#eef2ef] text-[#61716a]" }
        : wakeLockState === "failed"
          ? { label: "常亮失败", className: "border-[#b88a43]/25 bg-[#fff5df] text-[#8a682d]" }
          : { label: wakeLockPreferred ? "等待常亮" : "常亮关闭", className: "border-[#173f35]/12 bg-[#eef2ef] text-[#61716a]" };
  const locationPresentation: Record<LocationQuality, { label: string; className: string }> = {
    idle: { label: "等待定位", className: "border-[#173f35]/12 bg-[#eef2ef] text-[#61716a]" },
    locating: { label: "定位中", className: "border-[#1677ff]/20 bg-[#eaf3ff] text-[#2369b8]" },
    accurate: { label: "定位成功", className: "border-[#2f7457]/20 bg-[#e7f2eb] text-[#2f7457]" },
    degraded: { label: "定位偏移", className: "border-[#b88a43]/25 bg-[#fff5df] text-[#8a682d]" },
    denied: { label: "无法定位", className: "border-[#a33f37]/20 bg-[#fff0ee] text-[#913b34]" },
    unavailable: { label: "无法定位", className: "border-[#a33f37]/20 bg-[#fff0ee] text-[#913b34]" },
  };
  const locationStatus = locationPresentation[locationQuality];
  const externalNavigationUrl = useMemo(
    () => buildAmapExternalNavigationUrl(destination, mode),
    [destination, mode],
  );
  const hasGuidanceBanner = phase === "arrived" || Boolean(currentStep);
  const hasAlongRoutePanel = Boolean(summary) && phase !== "arrived";
  const shellClassName = immersive
    ? `fixed inset-0 z-[100] grid min-h-[100dvh] overflow-hidden bg-white ${hasGuidanceBanner ? hasAlongRoutePanel ? "grid-rows-[auto_auto_minmax(0,1fr)_auto_auto]" : "grid-rows-[auto_auto_minmax(0,1fr)_auto]" : hasAlongRoutePanel ? "grid-rows-[auto_minmax(0,1fr)_auto_auto]" : "grid-rows-[auto_minmax(0,1fr)_auto]"}`
    : "mt-4 overflow-hidden rounded-2xl border border-[#173f35]/16 bg-white shadow-[0_12px_32px_rgba(23,63,53,.10)]";

  return (
    <div className={shellClassName} data-immersive-navigation={immersive ? "true" : "false"}>
      <div className="border-b border-[#173f35]/10 bg-[#173f35] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-white/65">站内高德导航</p>
            <h3 className="mt-1 truncate text-base font-semibold">前往 {destination.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-[#e5d3af] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-semibold text-[#173f35] shadow-sm">{mode === "walk" ? "步行" : "驾车"}</span>
            <button
              type="button"
              disabled={wakeLockState === "unsupported" || wakeLockState === "requesting"}
              aria-pressed={wakeLockPreferred}
              aria-label={wakeLockPreferred ? "关闭导航屏幕常亮" : "开启导航屏幕常亮"}
              onClick={() => {
                const next = !wakeLockPreferredRef.current;
                wakeLockPreferredRef.current = next;
                setWakeLockPreferred(next);
                if (!next) releaseWakeLock();
                else if (phaseRef.current === "navigating") void requestWakeLock();
              }}
              className="grid size-9 place-items-center rounded-full border border-[#e5d3af] bg-[#fffaf0] text-[#173f35] shadow-sm transition-transform hover:bg-white active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {wakeLockState === "active" ? <LightbulbFilament size={18} weight="fill" /> : <Lightbulb size={18} />}
            </button>
            <button
              type="button"
              aria-pressed={immersive}
              aria-label={immersive ? "退出沉浸导航" : "进入沉浸导航"}
              onClick={() => setImmersive((current) => !current)}
              className="grid size-9 place-items-center rounded-full border border-[#e5d3af] bg-[#fffaf0] text-[#173f35] shadow-sm transition-transform hover:bg-white active:scale-[.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {immersive ? <ArrowsInSimple size={18} /> : <ArrowsOutSimple size={18} />}
            </button>
            <button
              type="button"
              disabled={!voiceSupported}
              aria-pressed={voiceEnabled}
              aria-label={voiceEnabled ? "关闭导航语音" : "开启导航语音"}
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
                spokenInstructionRef.current = "";
                if (!next) stopSpeech();
              }}
              className="grid size-9 place-items-center rounded-full border border-[#e5d3af] bg-[#fffaf0] text-[#173f35] shadow-sm transition-transform hover:bg-white active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {voiceEnabled ? <SpeakerHigh size={18} weight="fill" /> : <SpeakerSlash size={18} />}
            </button>
          </div>
        </div>
        {summary && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/10 px-3 py-2"><span className="block text-[10px] text-white/60">剩余距离</span><strong className="mt-0.5 block text-lg">{formatDistance(remainingDistance ?? summary.distance)}</strong></div>
            <div className="rounded-xl bg-white/10 px-3 py-2"><span className="block text-[10px] text-white/60">预计时间</span><strong className="mt-0.5 block text-lg">{formatDuration(remainingDuration ?? summary.duration)}</strong></div>
          </div>
        )}
        {routeRecoveryState === "restored" && (
          <div role="status" className="mt-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] leading-5 text-white/80">
            已恢复本标签页 30 分钟内的路线。{online ? "点击继续导航将刷新实时位置。" : "离线可查看原路线并定位，偏航后需联网重算。"}
          </div>
        )}
      </div>

      {phase === "arrived" && (
        <div className="flex items-center gap-3 border-b border-[#173f35]/10 bg-[#e7eee8] px-4 py-3" aria-live="polite">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#173f35] text-white"><CheckCircle size={23} weight="fill" /></span>
          <div><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#557066]">导航完成</p><p className="mt-0.5 text-sm font-semibold text-[#173f35]">已到达 {destination.name}</p></div>
        </div>
      )}

      {currentStep && phase !== "arrived" && (
        <div className="flex items-center gap-3 border-b border-[#173f35]/10 bg-[#fffaf0] px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#b88a43] text-white"><ArrowRight size={22} weight="bold" /></span>
          <div className="min-w-0"><p className="text-[11px] font-medium text-[#8a682d]">下一步 · {formatDistance(currentStep.distance)}</p><p className="mt-0.5 truncate text-sm font-semibold text-[#173f35]">{currentStep.instruction}</p></div>
        </div>
      )}

      <div className={`relative ${immersive ? "min-h-0 w-full" : "h-[390px] w-full sm:h-[460px]"}`}>
        <div ref={mapContainerRef} className="absolute inset-0 bg-[#dfe7e1]" aria-label="高德站内导航地图" />
        {!summary && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#edf2ed]/96 p-5 text-center" data-navigation-empty-state>
            <div className="w-full max-w-sm rounded-[1.5rem] border border-[#173f35]/12 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(23,63,53,.14)]">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#173f35] text-white"><NavigationArrow size={24} weight="fill" /></span>
              <h4 className="mt-3 text-base font-semibold text-[#173f35]">导航已经可以使用</h4>
              <p className="mt-2 text-xs leading-6 text-[#61716a]">先用高德地图完成公开道路导航；允许定位后，也可以继续体验本站路线预览。</p>
              {externalNavigationUrl && (
                <a
                  href={externalNavigationUrl}
                  rel="external"
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1677ff] px-4 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(22,119,255,.24)] transition-transform hover:brightness-105 active:scale-[.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]"
                >
                  <ArrowSquareOut size={19} weight="bold" />打开高德地图开始导航
                </a>
              )}
              <p className="mt-3 text-[10px] leading-5 text-[#78857f]">手机优先唤起高德地图 App；未安装时使用高德网页。目的地采用高德 POI 或入口坐标。</p>
            </div>
          </div>
        )}
        {mapLoadFailed && summary && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#e8eee9] px-6 text-center" role="status">
            <div className="max-w-sm rounded-2xl border border-[#173f35]/12 bg-white/92 p-5 shadow-[0_12px_32px_rgba(23,63,53,.12)] backdrop-blur-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#173f35] text-white"><NavigationArrow size={24} weight="fill" /></span>
              <p className="mt-3 text-sm font-semibold text-[#173f35]">底图暂不可用</p>
              <p className="mt-1 text-xs leading-5 text-[#61716a]">路线步骤与剩余信息已恢复；GPS 可继续推进旧路线，偏航重新规划需要网络和高德服务恢复。</p>
            </div>
          </div>
        )}
        {summary && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-[10px] font-semibold text-[#52655c] shadow-[0_6px_20px_rgba(23,63,53,.14)] backdrop-blur-sm" aria-label="路线颜色说明">
              <span className="inline-flex items-center gap-1"><span className="h-1 w-5 rounded-full bg-[#718078]" />已走</span>
              <span className="inline-flex items-center gap-1"><span className="h-1 w-5 rounded-full bg-[#1677ff]" />剩余</span>
              {companions.length > 0 && <span className="border-l border-[#173f35]/15 pl-2 text-[#8a682d]">同行 {companions.length}</span>}
            </div>
            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
              <button type="button" onClick={handleRecenter} aria-label="回到当前位置" className="grid size-11 place-items-center rounded-full border border-white/70 bg-white/95 text-[#1677ff] shadow-[0_6px_20px_rgba(23,63,53,.18)] transition-transform active:scale-[.96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#1677ff]"><Crosshair size={20} weight="bold" /></button>
              <button type="button" onClick={handleShowFullRoute} aria-label="查看全程路线" className="grid size-11 place-items-center rounded-full border border-white/70 bg-white/95 text-[#173f35] shadow-[0_6px_20px_rgba(23,63,53,.18)] transition-transform active:scale-[.96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]"><MapPin size={20} weight="fill" /></button>
            </div>
          </>
        )}
      </div>

      {hasAlongRoutePanel && (
        <section className="border-t border-[#173f35]/10 bg-[#f7f4ec] px-3 py-3" aria-labelledby={`${panelId}-along-route-title`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 id={`${panelId}-along-route-title`} className="text-xs font-semibold text-[#173f35]">沿途公开地点推荐</h4>
              <p className="mt-0.5 text-[10px] leading-4 text-[#68766e]">高德公开 POI，经路线走廊与当前前方进度二次过滤</p>
            </div>
            {alongRouteState === "loading" && <SpinnerGap className="shrink-0 animate-spin text-[#b88a43] motion-reduce:animate-none" size={16} aria-label="正在读取沿途地点" />}
          </div>
          {alongRouteState === "ready" && alongRouteRecommendations.length > 0 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="list">
              {alongRouteRecommendations.map((poi, index) => (
                <article key={poi.id} role="listitem" className="min-w-[14rem] rounded-xl border border-[#173f35]/12 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => mapRef.current?.setCenter(poi.entranceCoordinate ?? poi.coordinate)}
                    className="w-full px-3 pt-2 text-left outline-none transition-transform active:scale-[.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#b88a43]"
                  >
                    <span className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#b88a43] text-[10px] font-bold text-white">{index + 1}</span><span className="min-w-0"><strong className="block truncate text-xs text-[#173f35]">{poi.name}</strong><span className="mt-1 block text-[10px] leading-4 text-[#68766e]">前方 {formatDistance(poi.aheadMeters)} · 离路线约 {formatDistance(poi.distanceToRouteMeters)}</span>{poi.category && <span className="mt-0.5 block truncate text-[10px] text-[#8a682d]">{poi.category}</span>}</span></span>
                  </button>
                  <div className="px-3 pb-2"><AmapAlongRouteCommunityPreview poi={poi} /></div>
                </article>
              ))}
            </div>
          ) : alongRouteState === "ready" ? <p className="mt-2 text-[11px] leading-5 text-[#68766e]">当前剩余路线走廊内暂未找到匹配的公开景点或文化休闲地点。</p>
            : alongRouteState === "unavailable" ? <p className="mt-2 text-[11px] leading-5 text-[#8a682d]">{alongRouteMessage}</p>
              : <p className="mt-2 text-[11px] leading-5 text-[#68766e]">{alongRouteMessage}</p>}
        </section>
      )}

      <div className="border-t border-[#173f35]/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <p role="status" className="flex min-h-6 min-w-0 items-center gap-2 text-xs leading-5 text-[#5b6d64]">
            {isBusy ? <SpinnerGap className="shrink-0 animate-spin motion-reduce:animate-none" size={16} /> : phase === "arrived" ? <CheckCircle className="shrink-0 text-[#173f35]" size={17} weight="fill" /> : phase === "navigating" ? <NavigationArrow className="shrink-0 text-[#1677ff]" size={16} weight="fill" /> : <MapPin className="shrink-0 text-[#b88a43]" size={16} weight="fill" />}
            <span>{message}{compass && phase === "navigating" && ` 当前朝向${compass}。`}{locationAccuracy !== null && `（定位精度约 ${locationAccuracy} 米）`}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${online ? "border-[#2f7457]/20 bg-[#e7f2eb] text-[#2f7457]" : "border-[#b88a43]/25 bg-[#fff5df] text-[#8a682d]"}`}>{online ? "在线" : "离线"}</span>
            {(phase === "navigating" || phase === "paused") && <span aria-live="polite" className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${wakeLockPresentation.className}`}>{wakeLockPresentation.label}</span>}
            <span aria-live="polite" className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${locationStatus.className}`}>{locationStatus.label}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!summary && <button type="button" onClick={() => void handlePlan()} disabled={isBusy || !online} className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 sm:col-span-4"><Crosshair size={18} />{online ? locationQuality === "accurate" ? "生成网站内路线" : "重新定位并规划" : "联网后规划"}</button>}
          {summary && phase !== "navigating" && phase !== "arrived" && <button type="button" onClick={handleStart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1677ff] px-3 text-sm font-semibold text-white transition-transform active:scale-[.98] sm:col-span-2"><Play size={18} weight="fill" />{phase === "paused" ? "继续导航" : "开始导航"}</button>}
          {summary && phase === "navigating" && <button type="button" onClick={handlePause} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b88a43] px-3 text-sm font-semibold text-white sm:col-span-2"><Pause size={18} weight="fill" />暂停导航</button>}
          {summary && phase !== "arrived" && <button type="button" disabled={!online || locationQuality !== "accurate"} onClick={handleReplan} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-3 text-sm font-semibold text-[#173f35] transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"><ArrowClockwise size={18} />重新规划</button>}
          {summary && <button type="button" onClick={handleExit} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-3 text-sm font-semibold text-[#173f35] transition-transform active:scale-[.98] ${phase === "arrived" ? "col-span-2 sm:col-span-4" : ""}`}><SignOut size={18} />{phase === "arrived" ? "完成并退出" : "退出"}</button>}
        </div>
      </div>

      <details className={`${immersive ? "hidden" : ""} border-t border-[#173f35]/10 bg-[#f7f4ec]`} open={phase === "ready"}>
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[#173f35]">查看高德路线详情（{steps.length || 0} 步）</summary>
        {routeRecoveryState === "restored" && (
          <ol className="max-h-72 overflow-y-auto border-t border-[#173f35]/10 bg-white px-4 py-2">
            {steps.map((step, index) => (
              <li key={`${index}-${step.instruction}`} aria-current={index === activeStepIndex ? "step" : undefined} className={`flex gap-3 border-b border-[#173f35]/8 py-3 last:border-0 ${index === activeStepIndex ? "text-[#1677ff]" : "text-[#52655c]"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${index === activeStepIndex ? "bg-[#1677ff] text-white" : "bg-[#e7eee8] text-[#52655c]"}`}>{index + 1}</span>
                <span className="min-w-0"><strong className="block text-xs font-semibold">{step.instruction}</strong><span className="mt-1 block text-[10px]">{formatDistance(step.distance)} · {formatDuration(step.duration)}</span></span>
              </li>
            ))}
          </ol>
        )}
        <div id={panelId} className={`${routeRecoveryState === "restored" ? "hidden" : ""} max-h-72 overflow-y-auto border-t border-[#173f35]/10 bg-white [&_.amap-lib-driving]:border-0 [&_.amap-lib-walking]:border-0`} />
      </details>
    </div>
  );
}
