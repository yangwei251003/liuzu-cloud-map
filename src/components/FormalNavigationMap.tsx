"use client";

import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DirectedRoutePlan } from "@/lib/directed-route-engine";
import type { FormalGuidanceQuality, FormalNavigationRouteMatch } from "@/lib/formal-navigation-runtime";
import { buildFormalNavigationRouteDisplay } from "@/lib/formal-navigation-route-display";
import type { InstalledFormalOfflineMapBundle } from "@/lib/formal-offline-pack-client";
import { acquirePmtilesProtocol } from "@/lib/pmtiles-protocol.client";
import type { TravelGroupMapMember } from "@/components/TravelGroupNavigator";
import {
  createFormalNavigationAccuracyArea,
  formalNavigationMapQualityState,
  type FormalNavigationMapQualityState,
} from "@/lib/formal-navigation-map-state";
import {
  formalNavigationRemainingOverviewCoordinates,
  shouldAutoFollowFormalNavigationPosition,
  transitionFormalNavigationCamera,
  type FormalNavigationCameraMode,
} from "@/lib/formal-navigation-map-camera";

export type FormalNavigationMapPosition = {
  longitude: number;
  latitude: number;
  accuracyMeters: number;
};

type FormalNavigationMapProps = {
  plan: DirectedRoutePlan;
  position: FormalNavigationMapPosition | null;
  headingDegrees: number | null;
  guidanceQuality: FormalGuidanceQuality;
  routeMatch: FormalNavigationRouteMatch | null;
  companions?: TravelGroupMapMember[];
  offlineMapBundle?: InstalledFormalOfflineMapBundle | null;
};

const emptyPointCollection: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [],
};

const emptyAccuracyAreaCollection: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [],
};

const emptyLineCollection: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [],
};

function accuracyAreaCollection(
  position: FormalNavigationMapPosition | null,
  guidanceQuality: FormalGuidanceQuality,
): FeatureCollection<Polygon> {
  if (!position) return emptyAccuracyAreaCollection;
  const feature = createFormalNavigationAccuracyArea(position, guidanceQuality);
  return feature ? { type: "FeatureCollection", features: [feature] } : emptyAccuracyAreaCollection;
}

function qualityColor(state: FormalNavigationMapQualityState) {
  return state === "RELIABLE" ? "#2369d8" : state === "UNCERTAIN" ? "#b88a43" : "#9b453c";
}

function cameraModeLabel(mode: FormalNavigationCameraMode) {
  if (mode === "BROWSING") return "手动浏览地图";
  if (mode === "OVERVIEW") return "剩余路线总览";
  return "自动跟随当前位置";
}

function hasOriginalMapEvent(event: unknown) {
  return (
    typeof event === "object"
    && event !== null
    && "originalEvent" in event
    && Boolean((event as { originalEvent?: unknown }).originalEvent)
  );
}

function endpointCollection(plan: DirectedRoutePlan): FeatureCollection<Point> {
  const first = plan.geometry.coordinates[0];
  const last = plan.geometry.coordinates.at(-1);
  if (!first || !last) return emptyPointCollection;
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "origin" }, geometry: { type: "Point", coordinates: first } },
      { type: "Feature", properties: { kind: "destination" }, geometry: { type: "Point", coordinates: last } },
    ],
  };
}

export function FormalNavigationMap({
  plan,
  position,
  headingDegrees,
  guidanceQuality,
  routeMatch,
  companions = [],
  offlineMapBundle = null,
}: FormalNavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const positionMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const positionMarkerElementRef = useRef<HTMLDivElement | null>(null);
  const directionElementRef = useRef<HTMLSpanElement | null>(null);
  const companionMarkersRef = useRef(new Map<string, import("maplibre-gl").Marker>());
  const descriptionId = useId();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [cameraMode, setCameraMode] = useState<FormalNavigationCameraMode>("FOLLOWING");
  const routeDisplay = useMemo(
    () => buildFormalNavigationRouteDisplay(plan, routeMatch),
    [plan, routeMatch],
  );
  const canRecenter = shouldAutoFollowFormalNavigationPosition("FOLLOWING", guidanceQuality, position);

  const recenterOnCurrentPosition = () => {
    if (!canRecenter) return;
    setCameraMode((current) => transitionFormalNavigationCamera(current, "RECENTER"));
  };

  const showRemainingRoute = () => {
    const map = mapRef.current;
    if (!map || loadState !== "ready") return;
    setCameraMode((current) => transitionFormalNavigationCamera(current, "SHOW_REMAINING"));
    const coordinates = formalNavigationRemainingOverviewCoordinates(
      routeDisplay.remainingRoute,
      plan.geometry.coordinates,
    );
    if (coordinates.length === 0) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
    if (coordinates.length === 1) {
      map.easeTo({ center: coordinates[0], zoom: Math.max(16, map.getZoom()), duration });
      return;
    }
    void import("maplibre-gl").then((maplibregl) => {
      if (!mapRef.current) return;
      const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
      coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate));
      mapRef.current.fitBounds(bounds, {
        padding: { top: 88, right: 54, bottom: 88, left: 54 },
        maxZoom: 18,
        duration,
      });
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let releasePmtiles: (() => void) | null = null;
    const companionMarkers = companionMarkersRef.current;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      if (offlineMapBundle) releasePmtiles = acquirePmtilesProtocol(maplibregl);
      const first = plan.geometry.coordinates[0];
      if (!first) throw new Error("formal_route_geometry_empty");
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: first,
        zoom: 16,
        minZoom: 13,
        maxZoom: 20,
        attributionControl: false,
        localIdeographFontFamily: "system-ui, sans-serif",
        style: offlineMapBundle?.style ?? {
          version: 8,
          sources: {},
          layers: [{ id: "formal-paper", type: "background", paint: { "background-color": "#e8efe9" } }],
        },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      const suspendAutomaticFollow = (event: unknown) => {
        if (!hasOriginalMapEvent(event)) return;
        setCameraMode((current) => transitionFormalNavigationCamera(current, "USER_GESTURE"));
      };
      map.on("dragstart", suspendAutomaticFollow);
      map.on("zoomstart", suspendAutomaticFollow);
      map.on("rotatestart", suspendAutomaticFollow);
      map.on("error", () => {
        if (!cancelled) setLoadState("error");
      });
      map.on("load", () => {
        if (offlineMapBundle && offlineMapBundle.poiCatalog.features.length > 0) {
          map.addSource("formal-offline-pois", { type: "geojson", data: offlineMapBundle.poiCatalog });
          map.addLayer({
            id: "formal-offline-pois",
            type: "circle",
            source: "formal-offline-pois",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 7],
              "circle-color": "#b88a43",
              "circle-stroke-color": "#fffdf7",
              "circle-stroke-width": 2,
              "circle-opacity": 0.9,
            },
          });
        }
        map.addSource("formal-position-accuracy", { type: "geojson", data: emptyAccuracyAreaCollection });
        map.addLayer({
          id: "formal-position-accuracy-fill",
          type: "fill",
          source: "formal-position-accuracy",
          paint: {
            "fill-color": ["match", ["get", "qualityState"], "RELIABLE", "#2369d8", "UNCERTAIN", "#b88a43", "#9b453c"],
            "fill-opacity": ["match", ["get", "qualityState"], "RELIABLE", 0.14, "UNCERTAIN", 0.18, 0.12],
          },
        });
        map.addLayer({
          id: "formal-position-accuracy-outline",
          type: "line",
          source: "formal-position-accuracy",
          paint: {
            "line-color": ["match", ["get", "qualityState"], "RELIABLE", "#2369d8", "UNCERTAIN", "#b88a43", "#9b453c"],
            "line-width": 1.5,
            "line-opacity": 0.72,
          },
        });
        map.addSource("formal-route-completed", { type: "geojson", data: emptyLineCollection });
        map.addSource("formal-route-remaining", { type: "geojson", data: buildFormalNavigationRouteDisplay(plan, null).remainingRoute });
        map.addSource("formal-transport-route", { type: "geojson", data: buildFormalNavigationRouteDisplay(plan, null).remainingTransportRoute });
        map.addSource("formal-endpoints", { type: "geojson", data: endpointCollection(plan) });
        map.addLayer({
          id: "formal-route-completed-casing",
          type: "line",
          source: "formal-route-completed",
          paint: {
            "line-color": "#fffdf7",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 6, 19, 13],
            "line-opacity": 0.72,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "formal-route-completed-line",
          type: "line",
          source: "formal-route-completed",
          paint: {
            "line-color": "#7e8c85",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 19, 7],
            "line-opacity": 0.72,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "formal-route-remaining-casing",
          type: "line",
          source: "formal-route-remaining",
          paint: {
            "line-color": "#fffdf7",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 7, 19, 15],
            "line-opacity": 0.96,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "formal-route-remaining-line",
          type: "line",
          source: "formal-route-remaining",
          paint: {
            "line-color": "#2369d8",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 4, 19, 9],
            "line-opacity": 0.98,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "formal-transport-route-line",
          type: "line",
          source: "formal-transport-route",
          paint: {
            "line-color": ["match", ["get", "traversalMode"], "CABLEWAY", "#9b6330", "#b88a43"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 19, 10],
            "line-opacity": 1,
            "line-dasharray": [1.2, 1.2],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
        map.addLayer({
          id: "formal-endpoints",
          type: "circle",
          source: "formal-endpoints",
          paint: {
            "circle-radius": ["match", ["get", "kind"], "destination", 8, 6],
            "circle-color": ["match", ["get", "kind"], "destination", "#d95a4a", "#173f35"],
            "circle-stroke-color": "#fffdf7",
            "circle-stroke-width": 3,
          },
        });
        const bounds = new maplibregl.LngLatBounds(first, first);
        plan.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate));
        map.fitBounds(bounds, {
          padding: { top: 80, right: 54, bottom: 68, left: 54 },
          maxZoom: 18,
          duration: 0,
        });
        map.once("idle", () => {
          if (!cancelled) setLoadState("ready");
        });
      });
      mapRef.current = map;
    })().catch(() => {
      if (!cancelled) setLoadState("error");
    });

    return () => {
      cancelled = true;
      positionMarkerRef.current?.remove();
      positionMarkerRef.current = null;
      positionMarkerElementRef.current = null;
      directionElementRef.current = null;
      companionMarkers.forEach((marker) => marker.remove());
      companionMarkers.clear();
      releasePmtiles?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [offlineMapBundle, plan]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadState !== "ready") return;
    const completedSource = map.getSource("formal-route-completed") as import("maplibre-gl").GeoJSONSource | undefined;
    const remainingSource = map.getSource("formal-route-remaining") as import("maplibre-gl").GeoJSONSource | undefined;
    const transportSource = map.getSource("formal-transport-route") as import("maplibre-gl").GeoJSONSource | undefined;
    completedSource?.setData(routeDisplay.completedRoute);
    remainingSource?.setData(routeDisplay.remainingRoute);
    transportSource?.setData(routeDisplay.remainingTransportRoute);
  }, [loadState, routeDisplay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadState !== "ready") return;
    if (!position) {
      const accuracySource = map.getSource("formal-position-accuracy") as import("maplibre-gl").GeoJSONSource | undefined;
      accuracySource?.setData(emptyAccuracyAreaCollection);
      positionMarkerRef.current?.remove();
      positionMarkerRef.current = null;
      positionMarkerElementRef.current = null;
      directionElementRef.current = null;
      return;
    }
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (!mapRef.current) return;
      if (!positionMarkerRef.current) {
        const markerElement = document.createElement("div");
        markerElement.setAttribute("aria-hidden", "true");
        Object.assign(markerElement.style, {
          width: "34px",
          height: "34px",
          borderRadius: "999px",
          border: "4px solid #fffdf7",
          background: "#2369d8",
          boxShadow: "0 4px 16px rgba(20, 62, 110, .38)",
          display: "grid",
          placeItems: "center",
        });
        const direction = document.createElement("span");
        direction.textContent = "↑";
        Object.assign(direction.style, {
          display: "block",
          color: "white",
          fontSize: "19px",
          fontWeight: "800",
          lineHeight: "1",
          transformOrigin: "center",
        });
        markerElement.appendChild(direction);
        positionMarkerElementRef.current = markerElement;
        directionElementRef.current = direction;
        positionMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "center" })
          .setLngLat([position.longitude, position.latitude])
          .addTo(mapRef.current);
      } else {
        positionMarkerRef.current.setLngLat([position.longitude, position.latitude]);
      }
      if (directionElementRef.current) {
        directionElementRef.current.style.transform = `rotate(${headingDegrees ?? 0}deg)`;
        directionElementRef.current.style.opacity = formalNavigationMapQualityState(guidanceQuality) === "RELIABLE" ? "1" : "0";
      }
      const qualityState = formalNavigationMapQualityState(guidanceQuality);
      if (positionMarkerElementRef.current) {
        const color = qualityColor(qualityState);
        positionMarkerElementRef.current.style.background = color;
        positionMarkerElementRef.current.style.boxShadow = `0 4px 16px ${qualityState === "RELIABLE" ? "rgba(20, 62, 110, .38)" : qualityState === "UNCERTAIN" ? "rgba(128, 91, 30, .34)" : "rgba(126, 52, 45, .34)"}`;
      }
      const accuracySource = mapRef.current.getSource("formal-position-accuracy") as import("maplibre-gl").GeoJSONSource | undefined;
      accuracySource?.setData(accuracyAreaCollection(position, guidanceQuality));
      if (shouldAutoFollowFormalNavigationPosition(cameraMode, guidanceQuality, position)) {
        mapRef.current.easeTo({
          center: [position.longitude, position.latitude],
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350,
        });
      }
    })();
  }, [cameraMode, guidanceQuality, headingDegrees, loadState, position]);

  useEffect(() => {
    if (!mapRef.current || loadState !== "ready") return;
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !mapRef.current) return;
      const visibleIds = new Set(companions.map((member) => member.accountId));
      companionMarkersRef.current.forEach((marker, accountId) => {
        if (!visibleIds.has(accountId)) {
          marker.remove();
          companionMarkersRef.current.delete(accountId);
        }
      });
      companions.forEach((member) => {
        const existing = companionMarkersRef.current.get(member.accountId);
        if (existing) {
          existing.setLngLat([member.longitude, member.latitude]);
          return;
        }
        const element = document.createElement("div");
        element.setAttribute("aria-hidden", "true");
        element.title = `${member.displayName} · ${member.direction}约 ${Math.ceil(member.distanceMeters)} 米`;
        element.textContent = member.displayName.trim().slice(0, 1) || "友";
        Object.assign(element.style, {
          width: "32px",
          height: "32px",
          borderRadius: "999px",
          border: "3px solid #fffdf7",
          background: "#b88a43",
          color: "#173f35",
          boxShadow: "0 4px 14px rgba(52, 64, 43, .3)",
          display: "grid",
          placeItems: "center",
          fontSize: "12px",
          fontWeight: "800",
        });
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([member.longitude, member.latitude])
          .addTo(mapRef.current!);
        companionMarkersRef.current.set(member.accountId, marker);
      });
    })();
    return () => { cancelled = true; };
  }, [companions, loadState]);

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[1.35rem] border border-[#173f35]/12 bg-[#e8efe9]" data-formal-map-state={loadState} data-formal-route-progress={routeDisplay.matchApplied ? "matched" : "unmatched"} data-formal-camera-mode={cameraMode.toLowerCase()}>
      <p id={descriptionId} className="sr-only">{offlineMapBundle ? "正式验签离线地图。" : "正式导航示意地图。"}蓝线为剩余正式路线，灰线为最后确认已经走过的路线，金棕色虚线只显示剩余路线中的索道或观光车段；尚未取得可靠路线匹配时，整条路线保持蓝色。深绿色点为起点，红色点为终点；当前位置外的半透明区域是浏览器报告的定位精度圈，可靠时为蓝色、等待或低精度时为金色、停止指令时为红色。方向箭头只在定位可靠时显示。拖动、缩放或旋转会进入手动浏览，之后必须使用“回到当前位置”才能恢复自动跟随；“查看剩余路线”只调整本机地图视野。</p>
      <div ref={containerRef} role="region" aria-label="正式路线与当前位置地图" aria-describedby={descriptionId} className="h-[min(58dvh,520px)] min-h-[360px] w-full" />
      <div role="group" aria-label="导航地图视野" className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-4.75rem)] flex-wrap items-center gap-2">
        <span className="inline-flex min-h-10 items-center rounded-full border border-white/75 bg-[#fffdf7]/94 px-3 text-[11px] font-semibold text-[#315944] shadow-sm backdrop-blur">{cameraModeLabel(cameraMode)}</span>
        <button type="button" onClick={showRemainingRoute} disabled={loadState !== "ready"} className="min-h-11 rounded-full border border-white/75 bg-[#173f35] px-3 text-xs font-semibold text-white shadow-sm outline-none disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-[#b88a43]">查看剩余路线</button>
        {cameraMode !== "FOLLOWING" && <button type="button" onClick={recenterOnCurrentPosition} disabled={!canRecenter} className="min-h-11 rounded-full border border-white/75 bg-[#fffdf7]/96 px-3 text-xs font-semibold text-[#173f35] shadow-sm outline-none disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-[#b88a43]">回到当前位置</button>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">地图视野：{cameraModeLabel(cameraMode)}。</p>
      <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/75 bg-[#fffdf7]/94 px-3 py-2 text-[11px] leading-5 text-[#52675d] shadow-sm backdrop-blur">
        <strong className="block text-[#173f35]">{offlineMapBundle ? "验签离线底图 · 正式路线" : "正式路线示意层"}</strong>
        {routeDisplay.matchApplied ? "灰线已走 · 蓝线剩余" : "蓝线为完整待走路线"} ·
        {offlineMapBundle ? `包 ${offlineMapBundle.packId} · POI ${offlineMapBundle.poiCatalog.features.length} 个` : "不含城市底图或候选道路"} · {position ? `定位精度圈约 ${Math.round(position.accuracyMeters)} 米` : "等待前台定位"}{companions.length > 0 ? ` · 同行 ${companions.length} 人` : ""}
        {offlineMapBundle && <a href={offlineMapBundle.rightsEvidenceReference} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-[#315944] underline underline-offset-2">许可证据</a>}
      </div>
      {loadState === "loading" && <div role="status" className="absolute inset-0 grid place-items-center bg-[#e8efe9] text-sm text-[#52675d]">正在绘制正式路线…</div>}
      {loadState === "error" && <div role="alert" className="absolute inset-4 grid place-items-center rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed]/96 p-5 text-center text-sm leading-6 text-[#7d453d]">路线地图暂时无法绘制。文字距离和指令仍会保持同一套安全门禁；请同时查看现场标识。</div>}
    </div>
  );
}
