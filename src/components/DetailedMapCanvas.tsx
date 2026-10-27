"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { getAmapPresentationMode, getReleaseSafeAmapPresentationMode, type AmapPresentationModeId } from "@/lib/amap-modes";
import { scenicSpots } from "@/lib/scenic-data";
import {
  applyFacilitySubtypeFilter,
  applyMapLayerVisibility,
  applyMapTheme,
  applySelectedPrototypeRoute,
  addLocalMapData,
  fitMapToPrototypeRoute,
  loadLocalMapData,
  type LocalMapDataBundle,
} from "@/lib/map-rendering.client";
import {
  parseMapPoiCollection,
  parsePrototypeRouteCollection,
  type FacilitySubtype,
  type MapLayerId,
  type MapPoi,
  type MapSearchResult,
  type MapThemeId,
  type PrototypeRouteSummary,
} from "@/lib/map-experience";
import { acquirePmtilesProtocol } from "@/lib/pmtiles-protocol.client";
import { internalRouteProvider, publicRouteProvider, tileProvider, type ProviderStatus, type TileProviderPlan } from "@/lib/map-providers";

export type DetailedMapCatalog = {
  pois: MapPoi[];
  routes: PrototypeRouteSummary[];
  publicRoute: ProviderStatus;
  internalRoute: ProviderStatus;
  tiles: TileProviderPlan;
};

type DetailedMapCanvasProps = {
  theme: MapThemeId;
  presentationMode?: AmapPresentationModeId;
  /** Local visual research only; production ignores non-release modes. */
  demoOnlyModesEnabled?: boolean;
  variant?: "compact" | "full";
  visibleLayers: Record<MapLayerId, boolean>;
  facilitySubtypes: FacilitySubtype[];
  selectedRouteId: string | null;
  /** Never show an unverified local route without a separate local demo opt-in. */
  allowPrototypeRoutePreview?: boolean;
  focusTarget: MapSearchResult | null;
  onCatalogReady: (catalog: DetailedMapCatalog) => void;
  onPoiSelect: (poi: MapPoi) => void;
  selectedSpotId?: string;
  onSpotSelect?: (id: string) => void;
  socialLayerVisible?: boolean;
  onSocialSpotSelect?: (id: string) => void;
  onMapBlankClick?: () => void;
  onInteractionNotice?: (message: string) => void;
};

export type DetailedMapCanvasHandle = {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  locate: () => void;
  fitSelectedRoute: () => void;
};

const clickablePoiLayers = ["liuzu-facility-points", "liuzu-place-points", "liuzu-attraction-points"];
const fallbackModeLayers = ["liuzu-mode-fly-lines", "liuzu-mode-heat", "liuzu-mode-scatter", "liuzu-mode-ripple-outer", "liuzu-mode-ripple-core"] as const;

function addFallbackModeLayers(map: MapLibreMap) {
  const points: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: scenicSpots.map((spot) => ({
      type: "Feature",
      properties: { id: spot.id, verification: spot.verification },
      geometry: { type: "Point", coordinates: [spot.longitude, spot.latitude] },
    })),
  };
  const hub = scenicSpots[0];
  const lines: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: scenicSpots.slice(1).map((spot, index) => ({
      type: "Feature",
      properties: { kind: "VISUAL_RELATION_NOT_ROUTE" },
      geometry: {
        type: "LineString",
        coordinates: [
          [hub.longitude, hub.latitude],
          [(hub.longitude + spot.longitude) / 2 + (index % 2 === 0 ? 0.002 : -0.002), (hub.latitude + spot.latitude) / 2 + 0.0035],
          [spot.longitude, spot.latitude],
        ],
      },
    })),
  };
  map.addSource("liuzu-mode-points", { type: "geojson", data: points });
  map.addSource("liuzu-mode-lines", { type: "geojson", data: lines });
  map.addLayer({ id: "liuzu-mode-fly-lines", type: "line", source: "liuzu-mode-lines", layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#64d7ff", "line-width": 3, "line-opacity": 0.84, "line-dasharray": [1.3, 1.2] } });
  map.addLayer({ id: "liuzu-mode-heat", type: "circle", source: "liuzu-mode-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 12, 16, 54], "circle-color": "#e56a3b", "circle-opacity": 0.3, "circle-blur": 0.85, "circle-stroke-width": 1, "circle-stroke-color": "#e56a3b", "circle-stroke-opacity": 0.18 } });
  map.addLayer({ id: "liuzu-mode-scatter", type: "circle", source: "liuzu-mode-points", layout: { visibility: "none" }, paint: { "circle-radius": 6, "circle-color": "#8a55d7", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-opacity": 0.92 } });
  map.addLayer({ id: "liuzu-mode-ripple-outer", type: "circle", source: "liuzu-mode-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 8, 16, 24], "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2, "circle-stroke-color": "#c14e55", "circle-stroke-opacity": 0.42 } });
  map.addLayer({ id: "liuzu-mode-ripple-core", type: "circle", source: "liuzu-mode-points", layout: { visibility: "none" }, paint: { "circle-radius": 5, "circle-color": "#c14e55", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
}

function applyFallbackPresentationMode(map: MapLibreMap, modeId: AmapPresentationModeId) {
  for (const layerId of fallbackModeLayers) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
  }
  const mode = getAmapPresentationMode(modeId);
  if (mode.overlay === "fly-lines") map.setLayoutProperty("liuzu-mode-fly-lines", "visibility", "visible");
  if (mode.overlay === "heat") map.setLayoutProperty("liuzu-mode-heat", "visibility", "visible");
  if (mode.overlay === "scatter") map.setLayoutProperty("liuzu-mode-scatter", "visibility", "visible");
  if (mode.overlay === "ripple") {
    map.setLayoutProperty("liuzu-mode-ripple-outer", "visibility", "visible");
    map.setLayoutProperty("liuzu-mode-ripple-core", "visibility", "visible");
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.easeTo({
    pitch: modeId === "three-d" ? 54 : modeId === "fly-lines" ? 30 : 0,
    bearing: modeId === "three-d" ? 12 : 0,
    duration: reducedMotion ? 0 : 420,
  });
}

export const DetailedMapCanvas = forwardRef<DetailedMapCanvasHandle, DetailedMapCanvasProps>(function DetailedMapCanvas({
  theme,
  presentationMode = "amap-original",
  demoOnlyModesEnabled = false,
  variant = "full",
  visibleLayers,
  facilitySubtypes,
  selectedRouteId,
  allowPrototypeRoutePreview = false,
  focusTarget,
  onCatalogReady,
  onPoiSelect,
  selectedSpotId,
  onSpotSelect,
  socialLayerVisible = false,
  onSocialSpotSelect,
  onMapBlankClick,
  onInteractionNotice,
}, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const bundleRef = useRef<LocalMapDataBundle | null>(null);
  const poiByOsmKeyRef = useRef(new Map<string, MapPoi>());
  const onCatalogReadyRef = useRef(onCatalogReady);
  const onPoiSelectRef = useRef(onPoiSelect);
  const onSpotSelectRef = useRef(onSpotSelect);
  const onSocialSpotSelectRef = useRef(onSocialSpotSelect);
  const onMapBlankClickRef = useRef(onMapBlankClick);
  const socialLayerVisibleRef = useRef(socialLayerVisible);
  const scenicMarkerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const onInteractionNoticeRef = useRef(onInteractionNotice);
  const locationMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const localDemoEnabled = demoOnlyModesEnabled;
  const effectivePresentationMode = getReleaseSafeAmapPresentationMode(presentationMode, localDemoEnabled);
  const effectiveRouteId = localDemoEnabled && allowPrototypeRoutePreview ? selectedRouteId : null;
  const initialRef = useRef({ theme, presentationMode: effectivePresentationMode.id, visibleLayers, facilitySubtypes, selectedRouteId: effectiveRouteId, selectedSpotId, socialLayerVisible });
  const descriptionId = useId();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => { onCatalogReadyRef.current = onCatalogReady; }, [onCatalogReady]);
  useEffect(() => { onPoiSelectRef.current = onPoiSelect; }, [onPoiSelect]);
  useEffect(() => { onSpotSelectRef.current = onSpotSelect; }, [onSpotSelect]);
  useEffect(() => { onSocialSpotSelectRef.current = onSocialSpotSelect; }, [onSocialSpotSelect]);
  useEffect(() => { onMapBlankClickRef.current = onMapBlankClick; }, [onMapBlankClick]);
  useEffect(() => {
    socialLayerVisibleRef.current = socialLayerVisible;
    for (const [spotId, marker] of scenicMarkerElementsRef.current) {
      const spot = scenicSpots.find((candidate) => candidate.id === spotId);
      if (!spot) continue;
      marker.dataset.socialLayer = String(socialLayerVisible);
      const badge = marker.querySelector<HTMLElement>(".scenic-marker__badge");
      const label = marker.querySelector<HTMLElement>(".scenic-marker__label");
      const verification = marker.querySelector<HTMLElement>(".scenic-marker__verification");
      if (badge) badge.textContent = socialLayerVisible ? "社" : String(scenicSpots.findIndex((candidate) => candidate.id === spotId) + 1);
      if (label) label.textContent = socialLayerVisible ? `${spot.name}社区` : spot.name;
      if (verification) verification.textContent = socialLayerVisible ? "社区" : "地点";
      marker.setAttribute("aria-label", socialLayerVisible ? `进入${spot.name}游客社区` : `查看${spot.name}`);
    }
  }, [socialLayerVisible]);
  useEffect(() => { onInteractionNoticeRef.current = onInteractionNotice; }, [onInteractionNotice]);

  useImperativeHandle(forwardedRef, () => ({
    resetView() {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({
        center: [112.2185, 22.5938],
        zoom: 13.85,
        bearing: 0,
        pitch: 0,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 620,
      });
      onInteractionNoticeRef.current?.("已返回六祖镇区域全景。");
    },
    zoomIn() {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({ zoom: Math.min(map.getZoom() + 1, map.getMaxZoom()), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260 });
    },
    zoomOut() {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({ zoom: Math.max(map.getZoom() - 1, map.getMinZoom()), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260 });
    },
    locate() {
      const map = mapRef.current;
      if (!map || !("geolocation" in navigator)) {
        onInteractionNoticeRef.current?.("当前浏览器无法读取一次性位置，可继续手动浏览地图。");
        return;
      }
      onInteractionNoticeRef.current?.("正在请求一次性位置；不会开启后台持续定位。");
      navigator.geolocation.getCurrentPosition((position) => {
        const { longitude, latitude } = position.coords;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          onInteractionNoticeRef.current?.("浏览器返回的位置无效，可继续手动浏览地图。");
          return;
        }
        void import("maplibre-gl").then(({ Marker }) => {
          locationMarkerRef.current?.remove();
          locationMarkerRef.current = new Marker({ color: "#17624f", scale: 0.86 })
            .setLngLat([longitude, latitude])
            .addTo(map);
          map.easeTo({ center: [longitude, latitude], zoom: Math.max(16, map.getZoom()), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 680 });
          onInteractionNoticeRef.current?.("已显示本次浏览器定位；是否位于可游览区域仍需结合现场标识判断。");
        }).catch(() => onInteractionNoticeRef.current?.("定位点暂时无法绘制，可继续手动浏览地图。"));
      }, () => {
        onInteractionNoticeRef.current?.("未获得位置权限；地图不会持续请求或记录位置。");
      }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
    },
    fitSelectedRoute() {
      const map = mapRef.current;
      const bundle = bundleRef.current;
      if (map && bundle && effectiveRouteId) {
        fitMapToPrototypeRoute(map, bundle, effectiveRouteId, variant === "full" ? "workspace" : "default");
        return;
      }
      onInteractionNoticeRef.current?.("这条参考路线暂不支持景区内部导航，请以现场步道和指引为准。");
    },
  }), [effectiveRouteId, variant]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const scenicMarkerElements = scenicMarkerElementsRef.current;
    const abortController = new AbortController();
    let cancelled = false;
    let releasePmtiles: (() => void) | null = null;

    void (async () => {
      const [maplibregl, bundle] = await Promise.all([
        import("maplibre-gl"),
        loadLocalMapData(abortController.signal),
      ]);
      if (cancelled || !containerRef.current) return;
      releasePmtiles = acquirePmtilesProtocol(maplibregl);
      bundleRef.current = bundle;
      const pois = parseMapPoiCollection(bundle.pois);
      const routes = parsePrototypeRouteCollection(bundle.prototypeRoutes);
      poiByOsmKeyRef.current = new Map(pois.map((poi) => [poi.id, poi]));
      onCatalogReadyRef.current({
        pois,
        routes,
        publicRoute: publicRouteProvider.readiness(),
        internalRoute: internalRouteProvider.inspectManifest(bundle.formalNetwork),
        tiles: tileProvider.plan(null),
      });

      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const initialTheme = initialRef.current.theme;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [112.2185, 22.5938],
        zoom: 13.85,
        minZoom: 10.8,
        maxZoom: 19,
        attributionControl: false,
        localIdeographFontFamily: "system-ui, sans-serif",
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "liuzu-paper", type: "background", paint: { "background-color": initialTheme === "night" ? "#172722" : "#edf0ed" } }],
        },
      });
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · 资料更新 2026-08-14',
      }));

      map.on("load", () => {
        if (cancelled) return;
        addLocalMapData(map, bundle, initialTheme);
        addFallbackModeLayers(map);
        applyFallbackPresentationMode(map, initialRef.current.presentationMode);
        for (const [layerId, visible] of Object.entries(initialRef.current.visibleLayers) as [MapLayerId, boolean][]) {
          applyMapLayerVisibility(map, layerId, visible);
        }
        applyFacilitySubtypeFilter(map, initialRef.current.facilitySubtypes);
        applySelectedPrototypeRoute(map, initialRef.current.selectedRouteId);

        for (const [index, spot] of scenicSpots.entries()) {
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = "scenic-marker";
          marker.dataset.spotId = spot.id;
          marker.dataset.active = String(spot.id === initialRef.current.selectedSpotId);
          marker.dataset.socialLayer = String(initialRef.current.socialLayerVisible);
          marker.title = `${spot.name} · ${spot.verification} · 未经现场核验`;
          marker.setAttribute("aria-label", `查看${spot.name}`);
          const badge = document.createElement("span");
          badge.className = "scenic-marker__badge";
          badge.textContent = initialRef.current.socialLayerVisible ? "社" : String(index + 1);
          const label = document.createElement("span");
          label.className = "scenic-marker__label";
          label.textContent = initialRef.current.socialLayerVisible ? `${spot.name}社区` : spot.name;
          const verification = document.createElement("small");
          verification.className = "scenic-marker__verification";
          verification.textContent = initialRef.current.socialLayerVisible ? "社区" : "地点";
          marker.append(badge, label, verification);
          scenicMarkerElements.set(spot.id, marker);
          marker.addEventListener("click", () => {
            if (socialLayerVisibleRef.current) {
              onSocialSpotSelectRef.current?.(spot.id);
              return;
            }
            onSpotSelectRef.current?.(spot.id);
            map.easeTo({
              center: [spot.longitude, spot.latitude],
              zoom: Math.max(14.5, map.getZoom()),
              duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
            });
          });
          new maplibregl.Marker({ element: marker, anchor: "bottom" })
            .setLngLat([spot.longitude, spot.latitude])
            .addTo(map);
        }

        const selectPoi = (event: MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: clickablePoiLayers })[0];
          if (!feature?.properties) {
            onMapBlankClickRef.current?.();
            return;
          }
          const osmType = String(feature.properties.osm_type ?? "");
          const osmId = String(feature.properties.osm_id ?? "");
          const poi = poiByOsmKeyRef.current.get(`osm-${osmType}-${osmId}`);
          if (poi) onPoiSelectRef.current(poi);
          else onMapBlankClickRef.current?.();
        };
        map.on("click", selectPoi);
        for (const layerId of clickablePoiLayers) {
          map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", layerId, () => { map.getCanvas().style.removeProperty("cursor"); });
        }
        map.once("idle", () => { if (!cancelled) setStatus("ready"); });
      });
      mapRef.current = map;
    })().catch((error: unknown) => {
      if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) setStatus("error");
    });

    return () => {
      cancelled = true;
      abortController.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      bundleRef.current = null;
      locationMarkerRef.current = null;
      scenicMarkerElements.clear();
      releasePmtiles?.();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyMapTheme(map, theme);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyFallbackPresentationMode(map, effectivePresentationMode.id);
  }, [effectivePresentationMode.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    for (const [layerId, visible] of Object.entries(visibleLayers) as [MapLayerId, boolean][]) {
      applyMapLayerVisibility(map, layerId, visible);
    }
  }, [visibleLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyFacilitySubtypeFilter(map, facilitySubtypes);
  }, [facilitySubtypes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    applySelectedPrototypeRoute(map, effectiveRouteId);
    if (effectiveRouteId && bundleRef.current) fitMapToPrototypeRoute(map, bundleRef.current, effectiveRouteId, variant === "full" ? "workspace" : "default");
  }, [effectiveRouteId, variant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.easeTo({
      center: focusTarget.coordinates,
      zoom: Math.max(15, map.getZoom()),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600,
    });
  }, [focusTarget]);

  useEffect(() => {
    if (!selectedSpotId) return;
    const selected = scenicSpots.find(({ id }) => id === selectedSpotId);
    const map = mapRef.current;
    if (!selected || !map) return;
    map.easeTo({
      center: [selected.longitude, selected.latitude],
      zoom: Math.max(15, map.getZoom()),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
    });
  }, [selectedSpotId]);

  const artOverlayStyle: CSSProperties | undefined = effectivePresentationMode.artAssetPath ? {
    backgroundImage: `url("${effectivePresentationMode.artAssetPath}")`,
    backgroundPosition: effectivePresentationMode.artPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    mixBlendMode: effectivePresentationMode.artBlendMode,
    maskImage: "radial-gradient(ellipse at center, rgb(0 0 0 / 35%) 0%, rgb(0 0 0 / 52%) 42%, rgb(0 0 0 / 82%) 76%, #000 100%)",
    opacity: effectivePresentationMode.artOpacity,
    WebkitMaskImage: "radial-gradient(ellipse at center, rgb(0 0 0 / 35%) 0%, rgb(0 0 0 / 52%) 42%, rgb(0 0 0 / 82%) 76%, #000 100%)",
  } : undefined;

  return (
    <div className={`relative h-full w-full overflow-hidden ${variant === "compact" ? "min-h-0" : "min-h-[560px]"}`} data-map-load-status={status} data-map-provider="maplibre-local" data-map-release-mode={effectivePresentationMode.id} data-map-art-layer={effectivePresentationMode.artAssetPath ? "decorative" : "none"}>
      <p id={descriptionId} className="sr-only">详细地图包含 OSM 公开道路、建筑与服务设施。艺术风格只改变视觉表现，不改变道路、地点、文字标注或坐标；景区内部通行请以现场标识为准。候选地图不能替代现场标识或正式导航。</p>
      <div ref={containerRef} role="region" aria-label="六祖云游详细地图" aria-describedby={descriptionId} className={`h-full w-full ${variant === "compact" ? "min-h-0" : "min-h-[560px]"}`} />
      {artOverlayStyle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-200"
          data-map-art-overlay={effectivePresentationMode.id}
          data-map-art-asset={effectivePresentationMode.artAssetPath}
          data-map-art-geography="none"
          style={artOverlayStyle}
        />
      ) : null}
      {artOverlayStyle && variant === "compact" ? (
        <p className="pointer-events-none absolute left-3 top-24 z-20 rounded-full border border-[#173f35]/14 bg-[#fffdf8]/92 px-2.5 py-1 text-[10px] font-medium text-[#3d554c] shadow-sm" data-map-art-disclosure>
          艺术示意底纹 · 不对应真实地形
        </p>
      ) : null}
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#edf0ed]/85 p-6 text-center" role="status">
          <div><span className="block font-semibold text-[#173f35]">正在读取地图资料</span><span className="mt-2 block text-sm text-[#52655c]">建筑、道路、地点与参考路线将分层显示。</span></div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-4 z-30 grid place-items-center rounded-2xl border border-[#9b453c]/20 bg-[#fff6ed]/95 p-6 text-center text-[#7d453d]" role="alert">
          <div><strong className="block">详细地图暂时无法载入</strong><span className="mt-2 block max-w-md text-sm leading-6">本地数据或浏览器地图能力不可用。系统没有切换到未知外部底图，也不会生成替代路线。</span></div>
        </div>
      )}
    </div>
  );
});
