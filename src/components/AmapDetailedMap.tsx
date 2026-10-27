"use client";

import { Crosshair, Minus, Plus } from "@phosphor-icons/react";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createAmapDigitalExhibitionLayers, type AmapDigitalExhibitionBundle } from "@/components/AmapDigitalExhibitionLayers";
import type { DetailedMapCanvasHandle } from "@/components/DetailedMapCanvas";
import { AmapUnavailableError, loadOfficialAmap, loadOfficialLoca } from "@/lib/amap-loader.client";
import type { DigitalExhibitionLayerState } from "@/lib/amap-digital-exhibition";
import { getAmapFeatures, getAmapOverlayPlan, getAmapPresentationMode, getReleaseSafeAmapPresentationMode, type AmapPresentationModeId } from "@/lib/amap-modes";
import type { AmapCoordinate, AmapMap, AmapNamespace, AmapOverlay } from "@/lib/amap-types";
import type { MapLayerId, MapSearchResult } from "@/lib/map-experience";
import { scenicSpots, type ScenicSpot } from "@/lib/scenic-data";

const DEFAULT_CENTER: AmapCoordinate = scenicSpots[0].originalGcj02;
const MAP_READY_TIMEOUT_MS = 12_000;
const EXHIBITION_PARTICLE_COUNT = 30;

const SCENIC_MARKER_ART: Readonly<Partial<Record<string, `/assets/${string}.webp`>>> = {
  "guoen-temple": "/assets/map-markers/v1/guoen-temple.webp",
  "huineng-residence": "/assets/map-markers/v1/huineng-residence.webp",
  "longshan-spring": "/assets/map-markers/v1/longshan-hot-spring.webp",
  "zangfo-valley": "/assets/map-markers/v1/zangfo-valley.webp",
  "chanyu-town": "/assets/map-markers/v1/liuzu-town.webp",
};

type OverlayBundle = {
  overlays: AmapOverlay[];
  cleanups: Array<() => void>;
};

type ScenicMarkerKind = "pin" | "scatter" | "ripple" | "bubble";

export type AmapDetailedMapProps = {
  mode: AmapPresentationModeId;
  /** Local visual research only; production ignores non-release modes. */
  demoOnlyModesEnabled?: boolean;
  variant: "compact" | "full";
  visibleLayers: Record<MapLayerId, boolean>;
  focusTarget: MapSearchResult | null;
  selectedSpotId?: string;
  onSpotSelect?: (id: string) => void;
  socialLayerVisible?: boolean;
  onSocialSpotSelect?: (id: string) => void;
  exhibitionLayers?: DigitalExhibitionLayerState;
  onMapBlankClick?: () => void;
  onInteractionNotice?: (message: string) => void;
  onReady: () => void;
  onLimited: (reason: string) => void;
  onUnavailable: (reason: string) => void;
};

function createMarkerElement(
  spot: ScenicSpot,
  kind: ScenicMarkerKind,
  accent: string,
  modeId: AmapPresentationModeId,
  reducedMotion: boolean,
  selected: boolean,
  onActivate: () => void,
) {
  const usesIndigoPalette = modeId === "fly-lines";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "amap-scenic-marker";
  button.dataset.kind = kind;
  button.dataset.mode = modeId;
  button.dataset.selected = String(selected);
  button.title = `${spot.name} · ${spot.verification} · 未经现场核验`;
  button.setAttribute("aria-label", `聚焦${spot.name}`);
  Object.assign(button.style, {
    alignItems: "center",
    background: "transparent",
    border: "0",
    cursor: "pointer",
    display: "inline-flex",
    borderRadius: "12px",
    boxShadow: selected ? `0 0 0 3px #fffdf8, 0 0 0 6px ${accent}` : "none",
    filter: "drop-shadow(0 6px 7px rgb(24 57 46 / 18%))",
    minHeight: "44px",
    minWidth: "44px",
    outlineOffset: "3px",
    padding: "0",
    position: "relative",
    transition: reducedMotion ? "none" : "filter 180ms ease, box-shadow 180ms ease, transform 180ms ease",
  });

  const core = document.createElement("span");
  core.className = "amap-scenic-marker__core";
  core.style.setProperty("--amap-marker-accent", accent);
  Object.assign(core.style, {
    alignItems: "center",
    background: selected ? "#b83d32" : accent,
    border: `2px solid ${usesIndigoPalette ? "#e4c68f" : "#fffdf8"}`,
    borderRadius: "999px",
    color: "#fff",
    display: "grid",
    flex: "0 0 auto",
    fontSize: "11px",
    fontWeight: "780",
    height: "30px",
    justifyContent: "center",
    position: "relative",
    width: "30px",
    zIndex: "2",
  });
  core.textContent = String(scenicSpots.findIndex(({ id }) => id === spot.id) + 1);
  button.appendChild(core);

  let markerImageCleanup = () => undefined;
  const markerArtPath = SCENIC_MARKER_ART[spot.id];
  if (markerArtPath) {
    const usesScenicPhoto = markerArtPath.startsWith("/assets/scenic/");
    const markerImage = document.createElement("img");
    markerImage.className = "amap-scenic-marker__art";
    markerImage.src = markerArtPath;
    markerImage.alt = "";
    markerImage.decoding = "async";
    markerImage.hidden = true;
    Object.assign(markerImage.style, {
      filter: selected
        ? `drop-shadow(0 0 4px #fffdf8) drop-shadow(0 0 8px ${accent})`
        : "drop-shadow(0 5px 5px rgb(24 57 46 / 22%))",
      border: usesScenicPhoto ? `2px solid ${usesIndigoPalette ? "#e4c68f" : "#fffdf8"}` : "0",
      borderRadius: usesScenicPhoto ? "999px" : "0",
      height: "48px",
      objectFit: usesScenicPhoto ? "cover" : "contain",
      objectPosition: usesScenicPhoto ? "center" : "center bottom",
      position: "relative",
      width: "48px",
      zIndex: "2",
    });
    const revealMarkerArt = () => {
      core.hidden = true;
      core.style.display = "none";
      markerImage.hidden = false;
      markerImage.style.display = "block";
      button.dataset.artState = "ready";
    };
    const keepNumberedFallback = () => {
      core.hidden = false;
      core.style.display = "grid";
      markerImage.remove();
      button.dataset.artState = "fallback";
    };
    markerImage.addEventListener("load", revealMarkerArt, { once: true });
    markerImage.addEventListener("error", keepNumberedFallback, { once: true });
    button.insertBefore(markerImage, core);
    markerImageCleanup = () => {
      markerImage.removeEventListener("load", revealMarkerArt);
      markerImage.removeEventListener("error", keepNumberedFallback);
    };
  }

  const label = document.createElement("span");
  label.className = "amap-scenic-marker__label";
  label.textContent = spot.name;
  Object.assign(label.style, {
    background: usesIndigoPalette ? "rgb(14 31 40 / 94%)" : "rgb(255 252 246 / 94%)",
    border: `1px solid ${usesIndigoPalette ? "rgb(204 164 94 / 45%)" : selected ? accent : "rgb(25 61 51 / 16%)"}`,
    borderRadius: "0 8px 8px 0",
    color: usesIndigoPalette ? "#f2d6a0" : "#263f36",
    fontSize: "12px",
    fontWeight: "730",
    left: "-6px",
    maxWidth: "120px",
    overflow: "hidden",
    padding: "6px 9px 6px 13px",
    position: "relative",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: "1",
  });
  if (kind === "scatter") label.hidden = true;
  button.appendChild(label);

  const markerIndex = Math.max(0, scenicSpots.findIndex(({ id }) => id === spot.id));
  const entranceAnimation = reducedMotion ? null : button.animate(
    [
      { opacity: 0, transform: "translateY(10px) scale(.82)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    {
      delay: Math.min(markerIndex, 5) * 45,
      duration: 360,
      easing: "cubic-bezier(.16, 1, .3, 1)",
      fill: "backwards",
    },
  );

  const ambientAnimations: Animation[] = [];
  if (kind !== "scatter") {
    const haloCount = kind === "ripple" ? 3 : 2;
    for (let haloIndex = 0; haloIndex < haloCount; haloIndex += 1) {
      const halo = document.createElement("span");
      halo.className = "amap-scenic-marker__halo";
      halo.style.setProperty("--amap-marker-accent", accent);
      Object.assign(halo.style, {
        border: `2px solid ${accent}`,
        borderRadius: "999px",
        height: "42px",
        left: "1px",
        opacity: String(0.52 - haloIndex * 0.08),
        pointerEvents: "none",
        position: "absolute",
        top: "1px",
        transformOrigin: "center",
        width: "42px",
        zIndex: "0",
      });
      button.prepend(halo);
      if (!reducedMotion) {
        ambientAnimations.push(halo.animate(
          [{ transform: "scale(.5)", opacity: 0.56 }, { transform: "scale(1.72)", opacity: 0 }],
          { delay: haloIndex * 520, duration: 2_100, iterations: Infinity, easing: "ease-out" },
        ));
      }
    }
  }
  if (kind === "bubble" && !reducedMotion) {
    ambientAnimations.push(core.animate(
      [{ transform: "scale(.88)", opacity: 0.78 }, { transform: "scale(1.13)", opacity: 1 }, { transform: "scale(.88)", opacity: 0.78 }],
      { duration: 2_600, easing: "ease-in-out", iterations: Infinity },
    ));
  }

  const handlePointerEnter = () => {
    if (reducedMotion) return;
    button.style.filter = `drop-shadow(0 10px 14px ${accent}88)`;
    button.style.transform = "translateY(-8px) scale(1.12)";
  };
  const handlePointerLeave = () => {
    button.style.filter = "drop-shadow(0 6px 7px rgb(24 57 46 / 18%))";
    button.style.transform = "translateY(0) scale(1)";
  };
  button.addEventListener("pointerenter", handlePointerEnter);
  button.addEventListener("pointerleave", handlePointerLeave);

  const playClickBurst = () => {
    if (reducedMotion) return;
    const burst = document.createElement("span");
    Object.assign(burst.style, {
      border: `3px solid ${accent}`,
      borderRadius: "999px",
      height: "46px",
      left: "-1px",
      pointerEvents: "none",
      position: "absolute",
      top: "-1px",
      width: "46px",
      zIndex: "0",
    });
    button.prepend(burst);
    const burstAnimation = burst.animate(
      [{ transform: "scale(.55)", opacity: 0.95 }, { transform: "scale(2.25)", opacity: 0 }],
      { duration: 430, easing: "cubic-bezier(.16, 1, .3, 1)" },
    );
    burstAnimation.addEventListener("finish", () => burst.remove(), { once: true });
  };

  const activate = (event: Event) => {
    event.stopPropagation();
    playClickBurst();
    onActivate();
  };
  button.addEventListener("click", activate);
  return {
    element: button,
    cleanup: () => {
      entranceAnimation?.cancel();
      ambientAnimations.forEach((animation) => animation.cancel());
      markerImageCleanup();
      button.removeEventListener("pointerenter", handlePointerEnter);
      button.removeEventListener("pointerleave", handlePointerLeave);
      button.removeEventListener("click", activate);
    },
  };
}

function createSpotMarker(
  namespace: AmapNamespace,
  map: AmapMap,
  spot: ScenicSpot,
  kind: ScenicMarkerKind,
  accent: string,
  modeId: AmapPresentationModeId,
  reducedMotion: boolean,
  selected: boolean,
  onSpotSelect: ((id: string) => void) | undefined,
  socialLayerVisible: boolean,
  onSocialSpotSelect: ((id: string) => void) | undefined,
) {
  const marker = createMarkerElement(spot, kind, accent, modeId, reducedMotion, selected, () => {
    map.setCenter(spot.originalGcj02);
    map.setZoom(Math.max(15, map.getZoom()));
    if (socialLayerVisible) onSocialSpotSelect?.(spot.id);
    else onSpotSelect?.(spot.id);
  });
  marker.element.dataset.socialLayer = String(socialLayerVisible);
  marker.element.setAttribute("aria-label", socialLayerVisible ? `进入${spot.name}游客社区` : `查看${spot.name}`);
  const core = marker.element.querySelector<HTMLElement>(".amap-scenic-marker__core");
  const label = marker.element.querySelector<HTMLElement>(".amap-scenic-marker__label");
  if (socialLayerVisible) {
    if (core) core.textContent = "社";
    if (label) label.textContent = `${spot.name}社区`;
  }
  return {
    overlay: new namespace.Marker({
      position: spot.originalGcj02,
      content: marker.element,
      anchor: "center",
      zIndex: 180,
    }),
    cleanup: marker.cleanup,
  };
}

function createModeOverlays(
  namespace: AmapNamespace,
  map: AmapMap,
  modeId: AmapPresentationModeId,
  reducedMotion: boolean,
  selectedSpotId: string | undefined,
  onSpotSelect: ((id: string) => void) | undefined,
  socialLayerVisible: boolean,
  onSocialSpotSelect: ((id: string) => void) | undefined,
  exhibitionLayers: DigitalExhibitionLayerState | undefined,
): OverlayBundle {
  const mode = getAmapPresentationMode(modeId);
  const plan = getAmapOverlayPlan(modeId, reducedMotion);
  const overlays: AmapOverlay[] = [];
  const cleanups: Array<() => void> = [];
  const addMarker = (spot: ScenicSpot, kind: ScenicMarkerKind) => {
    const marker = createSpotMarker(namespace, map, spot, kind, mode.accent, modeId, reducedMotion, spot.id === selectedSpotId, onSpotSelect, socialLayerVisible, onSocialSpotSelect);
    overlays.push(marker.overlay);
    cleanups.push(marker.cleanup);
  };

  if (exhibitionLayers && !socialLayerVisible) {
    scenicSpots.forEach((spot, index) => {
      if (index < 2 && exhibitionLayers["core-ripples"]) addMarker(spot, "ripple");
      else if (index >= 2 && exhibitionLayers["ordinary-bubbles"]) addMarker(spot, "bubble");
    });
  } else if (plan.kind === "fly-lines") {
    const hub = scenicSpots[0].originalGcj02;
    scenicSpots.slice(1).forEach((spot, index) => {
      const target = spot.originalGcj02;
      const midpoint: AmapCoordinate = [
        (hub[0] + target[0]) / 2 + (index % 2 === 0 ? 0.002 : -0.002),
        (hub[1] + target[1]) / 2 + 0.0035,
      ];
      overlays.push(new namespace.Polyline({
        path: [hub, midpoint, target],
        strokeColor: mode.accent,
        strokeOpacity: 0.22,
        strokeWeight: 10,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        zIndex: 118,
      }));
      overlays.push(new namespace.Polyline({
        path: [hub, midpoint, target],
        strokeColor: mode.accent,
        strokeOpacity: 0.96,
        strokeWeight: 3,
        strokeStyle: "dashed",
        lineJoin: "round",
        lineCap: "round",
        zIndex: 120,
      }));

      if (!reducedMotion) {
        const dot = document.createElement("span");
        Object.assign(dot.style, {
          background: "#fff",
          border: `2px solid ${mode.accent}`,
          borderRadius: "999px",
          boxShadow: `0 0 8px ${mode.accent}, 0 0 18px ${mode.accent}`,
          display: "block",
          height: "10px",
          width: "10px",
        });
        const dotMarker = new namespace.Marker({
          position: hub,
          content: dot,
          anchor: "center",
          zIndex: 145,
        });
        overlays.push(dotMarker);
        let frame = 0;
        const duration = 3_600 + index * 360;
        const startedAt = performance.now() - index * 420;
        const animateDot = (now: number) => {
          const progress = ((now - startedAt) % duration) / duration;
          const firstHalf = progress < 0.5;
          const local = firstHalf ? progress * 2 : (progress - 0.5) * 2;
          const from = firstHalf ? hub : midpoint;
          const to = firstHalf ? midpoint : target;
          dotMarker.setPosition([
            from[0] + (to[0] - from[0]) * local,
            from[1] + (to[1] - from[1]) * local,
          ]);
          frame = window.requestAnimationFrame(animateDot);
        };
        frame = window.requestAnimationFrame(animateDot);
        cleanups.push(() => window.cancelAnimationFrame(frame));
      }
    });
    scenicSpots.forEach((spot) => addMarker(spot, "scatter"));
  } else if (plan.kind === "heat") {
    // 高德官方 HeatMap 插件不支持移动端；这里用等权 Circle 覆盖物做跨端视觉研究，
    // 不映射客流权重，也不声称是真实热力数据。
    scenicSpots.forEach((spot) => {
      const heatCircle = new namespace.Circle({
        center: spot.originalGcj02,
        radius: 360,
        strokeColor: mode.accent,
        strokeOpacity: 0.16,
        strokeWeight: 1,
        fillColor: mode.accent,
        fillOpacity: 0.24,
        zIndex: 90,
      });
      overlays.push(heatCircle);
      if (!reducedMotion) {
        let frame = 0;
        const startedAt = performance.now() - scenicSpots.indexOf(spot) * 180;
        const pulse = (now: number) => {
          const wave = (Math.sin((now - startedAt) / 620) + 1) / 2;
          heatCircle.setRadius(300 + wave * 170);
          frame = window.requestAnimationFrame(pulse);
        };
        frame = window.requestAnimationFrame(pulse);
        cleanups.push(() => window.cancelAnimationFrame(frame));
      }
      addMarker(spot, "scatter");
    });
  } else {
    const markerKind = plan.kind === "ripple" ? "ripple" : plan.kind === "scatter" ? "scatter" : "pin";
    scenicSpots.forEach((spot) => addMarker(spot, markerKind));
  }

  return { overlays, cleanups };
}

function clearOverlayBundle(map: AmapMap | null, bundle: OverlayBundle | null) {
  if (!bundle) return;
  if (map && bundle.overlays.length) map.remove(bundle.overlays);
  bundle.cleanups.forEach((cleanup) => cleanup());
}

function unavailableMessage(error: unknown) {
  if (!(error instanceof AmapUnavailableError)) return "高德地图运行异常，已切换本地地图。";
  if (error.code === "NOT_CONFIGURED") return "高德地图暂未启用，已切换到简洁地图。";
  if (error.code === "INVALID_CONFIGURATION") return "高德地图暂时不可用，已切换到简洁地图。";
  if (error.code === "CONFIG_UNAVAILABLE") return "地图服务暂时不可用，已切换到简洁地图。";
  return "高德地图暂时无法载入，已切换到简洁地图。";
}

function convertWgs84ToGcj02(namespace: AmapNamespace, coordinate: AmapCoordinate): Promise<AmapCoordinate | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 4_000);
    namespace.convertFrom(coordinate, "gps", (status, result) => {
      window.clearTimeout(timeout);
      if (status !== "complete" || typeof result === "string" || !result.locations?.[0]) {
        resolve(null);
        return;
      }
      const location = result.locations[0];
      const converted: AmapCoordinate = [location.getLng(), location.getLat()];
      resolve(converted.every(Number.isFinite) ? converted : null);
    });
  });
}

export const AmapDetailedMap = forwardRef<DetailedMapCanvasHandle, AmapDetailedMapProps>(function AmapDetailedMap({ mode, demoOnlyModesEnabled = false, variant, visibleLayers, focusTarget, selectedSpotId, onSpotSelect, socialLayerVisible = false, onSocialSpotSelect, exhibitionLayers, onMapBlankClick, onInteractionNotice, onReady, onLimited, onUnavailable }, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AmapMap | null>(null);
  const namespaceRef = useRef<AmapNamespace | null>(null);
  const overlaysRef = useRef<OverlayBundle | null>(null);
  const exhibitionBundleRef = useRef<AmapDigitalExhibitionBundle | null>(null);
  const appliedStyleRef = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  const onLimitedRef = useRef(onLimited);
  const onUnavailableRef = useRef(onUnavailable);
  const onSpotSelectRef = useRef(onSpotSelect);
  const onSocialSpotSelectRef = useRef(onSocialSpotSelect);
  const onMapBlankClickRef = useRef(onMapBlankClick);
  const onInteractionNoticeRef = useRef(onInteractionNotice);
  const descriptionId = useId();
  const [status, setStatus] = useState<"loading" | "limited" | "ready">("loading");
  const [focusNotice, setFocusNotice] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  // The compact map is hosted inside the fixed-height homepage viewport.  A
  // minimum height larger than that viewport pushes AMap's required logo and
  // copyright outside the clipped area, so compact mode must follow its host.
  const heightClass = variant === "compact" ? "min-h-0" : "min-h-[560px]";
  const effectiveMode = getReleaseSafeAmapPresentationMode(mode, demoOnlyModesEnabled);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onLimitedRef.current = onLimited; }, [onLimited]);
  useEffect(() => { onUnavailableRef.current = onUnavailable; }, [onUnavailable]);
  useEffect(() => { onSpotSelectRef.current = onSpotSelect; }, [onSpotSelect]);
  useEffect(() => { onSocialSpotSelectRef.current = onSocialSpotSelect; }, [onSocialSpotSelect]);
  useEffect(() => { onMapBlankClickRef.current = onMapBlankClick; }, [onMapBlankClick]);
  useEffect(() => { onInteractionNoticeRef.current = onInteractionNotice; }, [onInteractionNotice]);

  useImperativeHandle(forwardedRef, () => ({
    resetView() {
      const map = mapRef.current;
      if (!map) return;
      const selectedMode = getAmapPresentationMode(effectiveMode.id);
      map.setCenter(DEFAULT_CENTER);
      map.setPitch(selectedMode.pitch);
      map.setRotation(selectedMode.rotation);
      map.setZoom(selectedMode.zoom);
      onInteractionNoticeRef.current?.("已返回六祖镇区域全景。");
    },
    zoomIn() { mapRef.current?.zoomIn(); },
    zoomOut() { mapRef.current?.zoomOut(); },
    locate() {
      const map = mapRef.current;
      const namespace = namespaceRef.current;
      if (!map || !namespace || !("geolocation" in navigator)) {
        onInteractionNoticeRef.current?.("当前浏览器无法读取一次性位置，可继续手动浏览地图。");
        return;
      }
      onInteractionNoticeRef.current?.("正在请求一次性位置；不会开启后台持续定位。");
      navigator.geolocation.getCurrentPosition((position) => {
        void convertWgs84ToGcj02(namespace, [position.coords.longitude, position.coords.latitude]).then((coordinate) => {
          if (!coordinate) {
            onInteractionNoticeRef.current?.("本次位置未能安全转换到高德坐标，地图没有使用原始坐标。");
            return;
          }
          map.setCenter(coordinate);
          map.setZoom(Math.max(16, map.getZoom()));
          onInteractionNoticeRef.current?.("已聚焦本次浏览器定位；是否位于可游览区域仍需结合现场标识判断。");
        });
      }, () => onInteractionNoticeRef.current?.("未获得位置权限；地图不会持续请求或记录位置。"), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
    },
    fitSelectedRoute() {
      // This component is intentionally display-only: no local candidate line
      // is passed to AMap, and no provider routing service is invoked here.
      onInteractionNoticeRef.current?.("高德底图不执行景区内部路线计算；请等待已发布路网的确定性路线结果。 ");
    },
  }), [effectiveMode.id]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let activeMap: AmapMap | null = null;
    let readinessTimeout: number | null = null;
    let completed = false;
    let handleComplete = () => undefined;
    let handleError: (event?: unknown) => void = () => undefined;

    void loadOfficialAmap().then((namespace) => {
      if (cancelled || !containerRef.current) return;
      const initial = getAmapPresentationMode(effectiveMode.id);
      const map = new namespace.Map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: initial.zoom,
        minZoom: 10,
        maxZoom: 20,
        viewMode: "3D",
        pitch: initial.pitch,
        rotation: initial.rotation,
        mapStyle: initial.mapStyle,
        features: getAmapFeatures(visibleLayers),
        keyboardEnable: true,
        dragEnable: true,
        zoomEnable: true,
        doubleClickZoom: true,
        touchZoom: true,
        showLabel: true,
        showBuildingBlock: true,
      });
      namespaceRef.current = namespace;
      mapRef.current = map;
      activeMap = map;
      appliedStyleRef.current = initial.mapStyle;
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
      handleComplete = () => {
        if (cancelled || completed) return;
        completed = true;
        if (readinessTimeout !== null) window.clearTimeout(readinessTimeout);
        map.off("complete", handleComplete);
        map.off("error", handleError);
        setStatus("ready");
        onReadyRef.current();
      };
      handleError = () => {
        if (cancelled || completed) return;
        completed = true;
        if (readinessTimeout !== null) window.clearTimeout(readinessTimeout);
        map.off("complete", handleComplete);
        map.off("error", handleError);
        onUnavailableRef.current("高德地图暂未完成载入，已切换到简洁地图。");
      };
      map.on("complete", handleComplete);
      map.on("error", handleError);
      readinessTimeout = window.setTimeout(() => {
        if (cancelled || completed) return;
        setStatus("limited");
        const message = "高德地图尚未确认完整加载；当前保持受限浏览，不宣称底图已就绪。";
        onLimitedRef.current(message);
        onInteractionNoticeRef.current?.(message);
      }, MAP_READY_TIMEOUT_MS);
    }).catch((error: unknown) => {
      if (!cancelled) onUnavailableRef.current(unavailableMessage(error));
    });

    return () => {
      cancelled = true;
      if (readinessTimeout !== null) window.clearTimeout(readinessTimeout);
      if (activeMap) {
        activeMap.off("complete", handleComplete);
        activeMap.off("error", handleError);
      }
      resizeObserver?.disconnect();
      clearOverlayBundle(mapRef.current, overlaysRef.current);
      overlaysRef.current = null;
      exhibitionBundleRef.current?.destroy();
      exhibitionBundleRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      namespaceRef.current = null;
      appliedStyleRef.current = null;
    };
    // Map construction is intentionally single-shot; later effects update modes and layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const namespace = namespaceRef.current;
    if (!map || !namespace || status !== "ready") return;
    try {
      const selectedMode = getAmapPresentationMode(effectiveMode.id);
      clearOverlayBundle(map, overlaysRef.current);
      overlaysRef.current = null;
      if (appliedStyleRef.current !== selectedMode.mapStyle) {
        map.setMapStyle(selectedMode.mapStyle);
        appliedStyleRef.current = selectedMode.mapStyle;
      }
      const requestedFeatures = getAmapFeatures(visibleLayers);
      // Every visitor-facing skin is a presentation layer over the same
      // complete AMap information set. Never hide AMap POIs or place labels
      // merely because the visitor changes the visual style.
      map.setFeatures(requestedFeatures);
      map.setPitch(selectedMode.pitch);
      map.setRotation(selectedMode.rotation);
      // A visual skin switch must not throw away the visitor's current zoom or
      // centre. Geometry and exploration state stay untouched across themes.
      // Our registered scenic markers are a separate layer from AMap's public
      // POIs. Honour the visitor's places switch instead of leaving them on
      // screen while the provider point layer is hidden.
      overlaysRef.current = visibleLayers.places
        ? createModeOverlays(namespace, map, effectiveMode.id, reducedMotion, selectedSpotId, (id) => onSpotSelectRef.current?.(id), socialLayerVisible, (id) => onSocialSpotSelectRef.current?.(id), exhibitionLayers)
        : { overlays: [], cleanups: [] };
      map.add(overlaysRef.current.overlays);
    } catch {
      // A decorative overlay must never demote an already-created official base map
      // to the local research fallback. Keep the detailed AMap layer available and
      // fail only the optional visual treatment.
      clearOverlayBundle(map, overlaysRef.current);
      overlaysRef.current = null;
      onInteractionNoticeRef.current?.("高德专题叠加暂时不可用，已保留高德详细原图；公开道路与 POI 可继续查看。");
    }
  }, [effectiveMode.id, exhibitionLayers, reducedMotion, selectedSpotId, socialLayerVisible, status, visibleLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    exhibitionBundleRef.current?.destroy();
    exhibitionBundleRef.current = null;

    const shouldLoadLoca = Boolean(
      visibleLayers.places
      && exhibitionLayers
      && (exhibitionLayers["culture-links"] || exhibitionLayers["heat-demo"]),
    );
    if (!shouldLoadLoca || !exhibitionLayers) return;

    let cancelled = false;
    void loadOfficialLoca().then((locaApi) => {
      if (cancelled || !mapRef.current) return;
      exhibitionBundleRef.current = createAmapDigitalExhibitionLayers({
        map: mapRef.current,
        locaApi,
        layers: exhibitionLayers,
        reducedMotion,
      });
      if (exhibitionBundleRef.current) {
        onInteractionNoticeRef.current?.("展馆展示层已启用；飞线与热力均为颜色动效演示，不代表官方路线或实时客流。");
      }
    }).catch(() => {
      if (!cancelled) {
        onInteractionNoticeRef.current?.("展馆色彩图层暂未载入，已保留高德真实底图、道路与地点信息。");
      }
    });
    return () => {
      cancelled = true;
      exhibitionBundleRef.current?.destroy();
      exhibitionBundleRef.current = null;
    };
  }, [exhibitionLayers, reducedMotion, status, visibleLayers.places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const handleBlankMapClick = () => {
      // Custom scenic marker handlers stop propagation before this AMap map
      // event. AMap's base-surface clicks can still carry internal targets, so
      // filtering on event.target would leave the visitor detail card stuck.
      onMapBlankClickRef.current?.();
    };
    map.on("click", handleBlankMapClick);
    return () => map.off("click", handleBlankMapClick);
  }, [status]);

  useEffect(() => {
    if (!selectedSpotId) return;
    const selected = scenicSpots.find(({ id }) => id === selectedSpotId);
    if (!selected || !mapRef.current) return;
    mapRef.current.setCenter(selected.originalGcj02);
    mapRef.current.setZoom(Math.max(15, mapRef.current.getZoom()));
  }, [selectedSpotId]);

  useEffect(() => {
    const map = mapRef.current;
    const namespace = namespaceRef.current;
    if (!map || !namespace || !focusTarget) return;
    let cancelled = false;
    setFocusNotice("");
    const scenicCoordinate = scenicSpots.find(({ id }) => id === focusTarget.id)?.originalGcj02;
    void (scenicCoordinate ? Promise.resolve(scenicCoordinate) : convertWgs84ToGcj02(namespace, focusTarget.coordinates)).then((coordinate) => {
      if (cancelled) return;
      if (!coordinate) {
        setFocusNotice("该地点暂时无法在高德地图中定位，请稍后重试。");
        return;
      }
      map.setCenter(coordinate);
      map.setZoom(Math.max(15, map.getZoom()));
    });
    return () => { cancelled = true; };
  }, [focusTarget]);

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    const selectedMode = getAmapPresentationMode(effectiveMode.id);
    map.setCenter(DEFAULT_CENTER);
    map.setPitch(selectedMode.pitch);
    map.setRotation(selectedMode.rotation);
    map.setZoom(selectedMode.zoom);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const map = mapRef.current;
    if (!map) return;
    const panAmount = 80;
    if (event.key === "+" || event.key === "=") map.zoomIn();
    else if (event.key === "-") map.zoomOut();
    else if (event.key === "ArrowLeft") map.panBy(panAmount, 0);
    else if (event.key === "ArrowRight") map.panBy(-panAmount, 0);
    else if (event.key === "ArrowUp") map.panBy(0, panAmount);
    else if (event.key === "ArrowDown") map.panBy(0, -panAmount);
    else if (event.key === "Home") resetView();
    else return;
    event.preventDefault();
  }

  const usesTransparentOrnamentFrame = effectiveMode.id === "fly-lines";
  const showExhibitionParticles = Boolean(exhibitionLayers?.["ambient-particles"] && !reducedMotion);
  const edgeOnlyMask = "radial-gradient(ellipse at center, transparent 0%, rgb(0 0 0 / 4%) 38%, rgb(0 0 0 / 56%) 74%, #000 100%)";
  const artOverlayStyle: CSSProperties | undefined = effectiveMode.artAssetPath ? {
    backgroundImage: `url("${effectiveMode.artAssetPath}")`,
    backgroundPosition: effectiveMode.artPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    mixBlendMode: effectiveMode.artBlendMode,
    maskImage: usesTransparentOrnamentFrame ? "none" : edgeOnlyMask,
    opacity: effectiveMode.artOpacity,
    WebkitMaskImage: usesTransparentOrnamentFrame ? "none" : edgeOnlyMask,
  } : undefined;

  return (
    <div className={`relative h-full w-full overflow-hidden ${heightClass}`} data-map-provider="amap-jsapi-v2" data-map-load-status={status} data-map-release-mode={effectiveMode.id} data-map-art-layer={effectiveMode.artAssetPath ? "decorative" : "none"}>
      <p id={descriptionId} className="sr-only">六祖云游详细地图使用高德公开道路和地点信息；公开道路可直接在本站规划和导航，景区内部未开放步道不参与导航。艺术风格只改变视觉表现，不改变道路、地点、文字标注或坐标。</p>
      <div
        ref={containerRef}
        role="region"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={`六祖云游详细地图（${effectiveMode.name}，高德地图）`}
        aria-describedby={descriptionId}
        className={`h-full w-full outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#b88a43] ${heightClass}`}
      />
      {artOverlayStyle ? (
        <div
          key={effectiveMode.id}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] animate-[map-skin-enter_420ms_cubic-bezier(.16,1,.3,1)_both] transition-opacity duration-300"
          data-map-art-overlay={effectiveMode.id}
          data-map-art-asset={effectiveMode.artAssetPath}
          data-map-art-geography="none"
          style={artOverlayStyle}
        />
      ) : null}
      {showExhibitionParticles ? (
        <div className="amap-exhibition-particles" aria-hidden="true" data-map-exhibition-particles="decorative">
          {Array.from({ length: EXHIBITION_PARTICLE_COUNT }, (_, index) => (
            <span
              key={index}
              style={{
                "--particle-delay": `${(index * 173) % 2_600}ms`,
                "--particle-duration": `${5_200 + (index % 5) * 680}ms`,
                "--particle-left": `${(index * 37 + 9) % 96}%`,
                "--particle-size": `${3 + (index % 4)}px`,
                "--particle-top": `${(index * 23 + 7) % 88}%`,
              } as CSSProperties}
            />
          ))}
        </div>
      ) : null}
      {artOverlayStyle && variant === "compact" ? (
        <p className="pointer-events-none absolute left-3 top-24 z-20 rounded-full border border-[#173f35]/14 bg-[#fffdf8]/92 px-2.5 py-1 text-[10px] font-medium text-[#3d554c] shadow-sm" data-map-art-disclosure>
          艺术示意底纹 · 不对应真实地形
        </p>
      ) : null}
      <div className={`absolute right-3 z-20 grid gap-2 ${variant === "compact" ? "top-24" : "top-3"}`} data-map-compact-controls={variant === "compact" ? "safe-inset" : undefined} aria-label="地图视图控制">
        <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="放大地图" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#173f35]/15 bg-white/92 text-[#173f35] shadow-md outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Plus size={18} /></button>
        <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="缩小地图" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#173f35]/15 bg-white/92 text-[#173f35] shadow-md outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Minus size={18} /></button>
        <button type="button" onClick={resetView} aria-label="回到六祖镇区域" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#173f35]/15 bg-white/92 text-[#173f35] shadow-md outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]"><Crosshair size={18} /></button>
      </div>
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#edf0ed]/90 p-6 text-center" role="status">
          <div><span className="block font-semibold text-[#173f35]">正在连接高德地图</span><span className="mt-2 block text-sm text-[#52655c]">若暂时无法载入，将自动切换到简洁地图。</span></div>
        </div>
      )}
      {status === "limited" ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 w-[min(24rem,calc(100%_-_2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#9b6e2f]/25 bg-[#fff8e9]/95 px-4 py-3 text-center text-xs leading-5 text-[#6b4e27] shadow-lg" role="status">
          <strong className="block text-sm">高德底图尚未确认完整就绪</strong>
          当前仅限受限浏览，请勿据此进行景区内部导航；地图完成加载后会自动恢复。
        </div>
      ) : null}
      {focusNotice && <p className="absolute left-3 right-3 top-24 z-20 rounded-xl bg-[#fff5e7]/94 px-3 py-2 text-xs leading-5 text-[#7d5530]" role="status">{focusNotice}</p>}
    </div>
  );
});
