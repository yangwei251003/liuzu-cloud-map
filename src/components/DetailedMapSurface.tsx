"use client";

import { ListMagnifyingGlass, X } from "@phosphor-icons/react";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AmapDetailedMap } from "@/components/AmapDetailedMap";
import { DetailedMapCanvas, type DetailedMapCanvasHandle, type DetailedMapCatalog } from "@/components/DetailedMapCanvas";
import { getReleaseSafeAmapPresentationMode, type AmapPresentationModeId } from "@/lib/amap-modes";
import type { DigitalExhibitionLayerState } from "@/lib/amap-digital-exhibition";
import {
  DEFAULT_VISIBLE_MAP_LAYERS,
  FACILITY_SUBTYPES,
  parseMapPoiCollection,
  parsePrototypeRouteCollection,
  searchMapCatalog,
  type FacilitySubtype,
  type MapLayerId,
  type MapPoi,
  type MapSearchResult,
} from "@/lib/map-experience";
import { loadLocalMapData } from "@/lib/map-rendering.client";
import { internalRouteProvider, publicRouteProvider, tileProvider } from "@/lib/map-providers";
import { scenicSpots } from "@/lib/scenic-data";

export type DetailedMapProviderState = {
  provider: "amap-jsapi-v2" | "maplibre-local";
  readiness: "LOADING" | "LIMITED" | "READY" | "FALLBACK";
  coordinateSystem: "GCJ02" | "WGS84";
  message: string;
};

export type DetailedMapSurfaceProps = {
  variant?: "compact" | "full";
  mode?: AmapPresentationModeId;
  /** Local visual research only. Production always ignores experimental modes. */
  demoOnlyModesEnabled?: boolean;
  /** Allows the retired local prototype line only in an explicitly enabled local demo. */
  allowPrototypeRoutePreview?: boolean;
  forceLocal?: boolean;
  visibleLayers?: Record<MapLayerId, boolean>;
  facilitySubtypes?: readonly FacilitySubtype[];
  selectedRouteId?: string | null;
  activeRouteId?: string | null;
  focusTarget?: MapSearchResult | null;
  selectedSpotId?: string;
  onSpotSelect?: (id: string) => void;
  socialLayerVisible?: boolean;
  onSocialSpotSelect?: (id: string) => void;
  exhibitionLayers?: DigitalExhibitionLayerState;
  onMapBlankClick?: () => void;
  onCatalogReady?: (catalog: DetailedMapCatalog) => void;
  onPoiSelect?: (poi: MapPoi) => void;
  onProviderChange?: (state: DetailedMapProviderState) => void;
  onInteractionNotice?: (message: string) => void;
};

const noOpCatalog = () => undefined;
const noOpPoi = () => undefined;

const initialProviderState: DetailedMapProviderState = {
  provider: "amap-jsapi-v2",
  readiness: "LOADING",
  coordinateSystem: "GCJ02",
  message: "正在连接高德地图。",
};

type AccessibleMapCatalogProps = {
  pois: readonly MapPoi[];
  focusTarget: MapSearchResult | null;
  selectedSpotId?: string;
  onSpotSelect?: (id: string) => void;
  onPoiSelect: (poi: MapPoi) => void;
};

/**
 * A canvas or vendor JS map cannot be the only way to discover POIs. This
 * native control is deliberately rendered above either provider and uses the
 * same locally loaded candidate catalog as the map surface.
 */
function AccessibleMapCatalog({ pois, focusTarget, selectedSpotId, onSpotSelect, onPoiSelect }: AccessibleMapCatalogProps) {
  const inputId = useId();
  const resultId = useId();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (query.trim()) return searchMapCatalog(query, scenicSpots, [...pois], 18);
    return [
      ...scenicSpots.map<MapSearchResult>((spot) => ({
        id: spot.id,
        kind: "SCENIC_SPOT",
        name: spot.name,
        detail: spot.subtitle,
        coordinates: [spot.longitude, spot.latitude],
        verification: `${spot.verification} · 未经现场核验`,
      })),
      ...pois.map<MapSearchResult>((poi) => ({
        id: poi.id,
        kind: "OSM_POI",
        name: poi.name,
        detail: `${poi.category} · ${poi.subtype}`,
        coordinates: poi.coordinates,
        verification: "公开地图资料 · 请以现场为准",
      })),
    ].slice(0, 18);
  }, [pois, query]);

  function selectResult(result: MapSearchResult) {
    if (result.kind === "SCENIC_SPOT") {
      onSpotSelect?.(result.id);
      return;
    }
    const poi = pois.find((candidate) => candidate.id === result.id);
    if (poi) onPoiSelect(poi);
  }

  const closeCatalog = useCallback(() => {
    // The trigger never unmounts, so restoring focus synchronously is more
    // reliable than waiting for a paint frame (especially after Escape).
    toggleRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeCatalog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeCatalog, open]);

  return (
    <div data-map-accessible-catalog>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className="absolute bottom-28 left-3 right-auto z-40 inline-flex min-h-12 max-w-[calc(100%_-_1.5rem)] items-center gap-2 rounded-xl border border-[#173f35]/20 bg-[#fffdf8] px-4 text-sm font-semibold text-[#173f35] shadow-md outline-none transition-colors hover:bg-[#f5efe5] focus-visible:ring-3 focus-visible:ring-[#b88a43] lg:bottom-4 lg:left-auto lg:right-36"
      >
        <ListMagnifyingGlass size={20} weight="duotone" aria-hidden="true" />
        地点与服务设施
      </button>
      {open ? (
        <section
          id={panelId}
          className="absolute bottom-28 left-3 right-auto z-40 flex max-h-[min(62vh,32rem)] w-[min(25rem,calc(100%_-_1.5rem))] flex-col overflow-hidden rounded-xl border border-[#173f35]/25 bg-[#fffdf8] text-[#173f35] shadow-xl lg:bottom-4 lg:left-auto lg:right-36"
          aria-labelledby={resultId}
        >
          <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[#173f35]/15 px-4">
            <h2 id={resultId} className="text-sm font-semibold">地点与服务设施目录</h2>
            <button type="button" onClick={closeCatalog} aria-label="关闭地点与服务设施目录" className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#173f35] outline-none hover:bg-[#eee7dc] focus-visible:ring-3 focus-visible:ring-[#b88a43]"><X size={19} aria-hidden="true" /></button>
          </header>
          <div className="min-h-0 overflow-y-auto p-4">
            <p className="text-xs leading-5 text-[#52655c]">目录与地图使用同一公开资料；开放、入口与内部通行请以现场标识和景区信息为准。</p>
            <label htmlFor={inputId} className="mt-3 block text-xs font-medium">按名称、类别或设施搜索</label>
            <input
              ref={inputRef}
              id={inputId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={80}
              aria-describedby={`${resultId}-count`}
              placeholder="例如：停车、卫生间、国恩寺"
              className="mt-1 min-h-11 w-full rounded-lg border border-[#173f35]/25 bg-white px-3 text-sm outline-none placeholder:text-[#68766f] focus-visible:ring-3 focus-visible:ring-[#b88a43]"
            />
            <p id={`${resultId}-count`} className="mt-2 text-xs text-[#52655c]" role="status" aria-live="polite">显示 {results.length} 个地点与服务设施。</p>
            <ul className="mt-2 grid gap-2" aria-label="地点与服务设施结果">
              {results.length === 0 ? <li className="rounded-lg bg-[#f5efe5] px-3 py-2 text-sm">没有找到匹配的地点或设施。</li> : null}
              {results.map((result) => {
                const selected = selectedSpotId === result.id || focusTarget?.id === result.id;
                const kindLabel = result.kind === "SCENIC_SPOT" ? "景点" : "服务设施或地点";
                return (
                  <li key={`${result.kind}-${result.id}`}>
                    <button
                      type="button"
                      onClick={() => selectResult(result)}
                      aria-current={selected ? "true" : undefined}
                      className="min-h-11 w-full rounded-lg border border-[#173f35]/15 bg-white px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-[#f5efe5] focus-visible:ring-3 focus-visible:ring-[#b88a43]"
                    >
                      <span className="block font-semibold">{result.name}{selected ? "（当前选中）" : ""}</span>
                      <span className="mt-0.5 block text-xs text-[#52655c]">{kindLabel} · {result.detail}</span>
                      <span className="mt-0.5 block text-xs font-medium text-[#6f4f22]">{result.verification}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export const DetailedMapSurface = forwardRef<DetailedMapCanvasHandle, DetailedMapSurfaceProps>(function DetailedMapSurface({
  variant = "full",
  mode = "amap-original",
  demoOnlyModesEnabled = false,
  allowPrototypeRoutePreview = false,
  forceLocal = false,
  visibleLayers = DEFAULT_VISIBLE_MAP_LAYERS,
  facilitySubtypes,
  selectedRouteId = null,
  activeRouteId,
  focusTarget = null,
  selectedSpotId,
  onSpotSelect,
  socialLayerVisible = false,
  onSocialSpotSelect,
  exhibitionLayers,
  onMapBlankClick,
  onCatalogReady = noOpCatalog,
  onPoiSelect = noOpPoi,
  onProviderChange,
  onInteractionNotice,
}, forwardedRef) {
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const [providerState, setProviderState] = useState<DetailedMapProviderState>(initialProviderState);
  const [accessiblePois, setAccessiblePois] = useState<MapPoi[]>([]);
  const onCatalogReadyRef = useRef(onCatalogReady);
  const onProviderChangeRef = useRef(onProviderChange);
  const amapRef = useRef<DetailedMapCanvasHandle>(null);
  const localRef = useRef<DetailedMapCanvasHandle>(null);
  // A caller must explicitly opt in to experimental visual treatments. They
  // remain labelled as demo modes in production preview builds as well.
  const demoModeEnabled = demoOnlyModesEnabled;
  const selectedMode = getReleaseSafeAmapPresentationMode(mode, demoModeEnabled);
  const effectiveRouteId = demoModeEnabled && allowPrototypeRoutePreview ? activeRouteId ?? selectedRouteId : null;
  const effectiveFacilitySubtypes = facilitySubtypes ? [...facilitySubtypes] : [...FACILITY_SUBTYPES];
  const renderLocal = forceLocal || useLocalFallback;
  const effectiveProviderState = useMemo<DetailedMapProviderState>(() => forceLocal ? {
    provider: "maplibre-local",
    readiness: "FALLBACK",
    coordinateSystem: "WGS84",
    message: "高德地图暂未载入，已切换到简洁地图；景区内部通行请以现场标识为准。",
  } : providerState, [forceLocal, providerState]);

  useImperativeHandle(forwardedRef, () => ({
    resetView: () => (renderLocal ? localRef.current : amapRef.current)?.resetView(),
    zoomIn: () => (renderLocal ? localRef.current : amapRef.current)?.zoomIn(),
    zoomOut: () => (renderLocal ? localRef.current : amapRef.current)?.zoomOut(),
    locate: () => (renderLocal ? localRef.current : amapRef.current)?.locate(),
    fitSelectedRoute: () => (renderLocal ? localRef.current : amapRef.current)?.fitSelectedRoute(),
  }), [renderLocal]);

  useEffect(() => { onCatalogReadyRef.current = onCatalogReady; }, [onCatalogReady]);
  useEffect(() => { onProviderChangeRef.current = onProviderChange; }, [onProviderChange]);
  useEffect(() => { onProviderChangeRef.current?.(effectiveProviderState); }, [effectiveProviderState]);

  useEffect(() => {
    const abortController = new AbortController();
    void loadLocalMapData(abortController.signal).then((bundle) => {
      const pois = parseMapPoiCollection(bundle.pois);
      setAccessiblePois(pois);
      onCatalogReadyRef.current({
        pois,
        routes: parsePrototypeRouteCollection(bundle.prototypeRoutes),
        publicRoute: publicRouteProvider.readiness(),
        internalRoute: internalRouteProvider.inspectManifest(bundle.formalNetwork),
        tiles: tileProvider.plan(null),
      });
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // AMap remains usable even when the optional local research catalog is unavailable.
      }
    });
    return () => abortController.abort();
  }, []);

  function activateFallback(reason: string) {
    setUseLocalFallback(true);
    setProviderState({
      provider: "maplibre-local",
      readiness: "FALLBACK",
      coordinateSystem: "WGS84",
      message: reason,
    });
  }

  return (
    <div className="relative h-full w-full" data-detailed-map-variant={variant} data-detailed-map-mode={selectedMode.id} data-map-release-boundary={demoModeEnabled ? "demo-only" : "release"}>
      {renderLocal ? (
        <DetailedMapCanvas
          ref={localRef}
          variant={variant}
          theme={selectedMode.fallbackTheme}
          presentationMode={selectedMode.id}
          demoOnlyModesEnabled={demoModeEnabled}
          visibleLayers={visibleLayers}
          facilitySubtypes={effectiveFacilitySubtypes}
          selectedRouteId={effectiveRouteId}
          allowPrototypeRoutePreview={demoModeEnabled && allowPrototypeRoutePreview}
          focusTarget={focusTarget}
          selectedSpotId={selectedSpotId}
          onSpotSelect={onSpotSelect}
          socialLayerVisible={socialLayerVisible}
          onSocialSpotSelect={onSocialSpotSelect}
          onMapBlankClick={onMapBlankClick}
          onCatalogReady={onCatalogReady}
          onPoiSelect={onPoiSelect}
          onInteractionNotice={onInteractionNotice}
        />
      ) : (
        <AmapDetailedMap
          ref={amapRef}
          variant={variant}
          mode={selectedMode.id}
          demoOnlyModesEnabled={demoModeEnabled}
          visibleLayers={visibleLayers}
          focusTarget={focusTarget}
          selectedSpotId={selectedSpotId}
          onSpotSelect={onSpotSelect}
          socialLayerVisible={socialLayerVisible}
          onSocialSpotSelect={onSocialSpotSelect}
          exhibitionLayers={exhibitionLayers}
          onMapBlankClick={onMapBlankClick}
          onInteractionNotice={onInteractionNotice}
          onReady={() => setProviderState({
            provider: "amap-jsapi-v2",
            readiness: "READY",
            coordinateSystem: "GCJ02",
            message: "高德地图已连接；公开道路导航可用，景区内部步道请以现场指引为准。",
          })}
          onLimited={(message) => setProviderState({
            provider: "amap-jsapi-v2",
            readiness: "LIMITED",
            coordinateSystem: "GCJ02",
            message,
          })}
          onUnavailable={activateFallback}
        />
      )}

      <div style={{ right: "auto", bottom: "auto", width: "min(72%, 23rem)", height: "auto" }} className="pointer-events-none absolute left-3 top-3 z-30 rounded-xl border border-white/55 bg-[#173f35]/88 px-3 py-2 text-left text-[10px] leading-4 text-white shadow-lg backdrop-blur-sm" role="status" aria-live="polite">
        <strong className="block text-[11px]">{effectiveProviderState.provider === "amap-jsapi-v2" ? "高德地图" : "简洁地图"}</strong>
        <span className="block text-white/78">{effectiveProviderState.message}</span>
        {effectiveProviderState.provider === "amap-jsapi-v2" && <span className="block text-white/68">可从路线规划区直接在本站开始步行或驾车导航</span>}
      </div>
      {variant === "full" ? (
        <AccessibleMapCatalog
          pois={accessiblePois}
          focusTarget={focusTarget}
          selectedSpotId={selectedSpotId}
          onSpotSelect={onSpotSelect}
          onPoiSelect={onPoiSelect}
        />
      ) : null}
    </div>
  );
});
