"use client";

import {
  ArrowRight,
  CaretLeft,
  CaretDown,
  CaretRight,
  CaretUp,
  ChartLineUp,
  ChatsCircle,
  Check,
  Compass,
  Crosshair,
  CornersIn,
  CornersOut,
  Eye,
  Info,
  MagnifyingGlass,
  MapTrifold,
  MapPin,
  Minus,
  Mountains,
  Path,
  Plus,
  RoadHorizon,
  SlidersHorizontal,
  Stack,
  Star,
  Sparkle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DetailedMapCanvasHandle, DetailedMapCatalog } from "@/components/DetailedMapCanvas";
import { DetailedMapSurface, type DetailedMapProviderState } from "@/components/DetailedMapSurface";
import { PublicNavigationPanel } from "@/components/PublicNavigationPanel";
import { LeafletMapView } from "@/components/leaflet/LeafletMapView";
import {
  DEFAULT_DIGITAL_EXHIBITION_LAYERS,
  DIGITAL_EXHIBITION_DISCLOSURE,
  DIGITAL_EXHIBITION_LAYERS,
  getDigitalExhibitionLayer,
  type DigitalExhibitionLayerId,
} from "@/lib/amap-digital-exhibition";
import { getAmapPresentationModes, type AmapPresentationModeId } from "@/lib/amap-modes";
import {
  DEFAULT_VISIBLE_MAP_LAYERS,
  FACILITY_SUBTYPES,
  formatMapDistance,
  searchMapCatalog,
  type FacilitySubtype,
  type MapLayerId,
  type MapPoi,
  type MapSearchResult,
} from "@/lib/map-experience";
import { scenicSpots } from "@/lib/scenic-data";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import { SOCIAL_COMMUNITIES } from "@/lib/social/catalog";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import type { Place, Activity } from "@/lib/portal/types";

const emptyCatalog: DetailedMapCatalog = {
  pois: [],
  routes: [],
  publicRoute: { readiness: "UNAVAILABLE", code: "LOADING", message: "正在检查公共路线能力。" },
  internalRoute: { readiness: "UNAVAILABLE", code: "LOADING", message: "正在检查正式内部路网。" },
  tiles: { providerId: "loading", readiness: "FALLBACK_GEOJSON", pmtilesArchiveUrl: null, message: "正在读取地图源。", sources: [] },
};

const initialProviderState: DetailedMapProviderState = {
  provider: "amap-jsapi-v2",
  readiness: "LOADING",
  coordinateSystem: "GCJ02",
  message: "正在连接高德地图。",
};

const MAP_PRESENTATION_MODES = getAmapPresentationModes();
const MOBILE_EXHIBITION_LAYERS: readonly DigitalExhibitionLayerId[] = ["culture-links", "heat-demo", "comparison-columns", "ambient-particles"];
const FICTIONAL_NAVIGATION_LAB_ENABLED = process.env.NODE_ENV !== "production"
  || process.env.NEXT_PUBLIC_FICTIONAL_NAVIGATION_LAB_ENABLED === "1";

const spotNames = new Map(scenicSpots.map((spot) => [spot.id, spot.name]));
const routeLineNames = ["文化寻源参考线", "山水慢游参考线", "南北串联参考线"] as const;
function routeName(index: number) {
  return routeLineNames[index] ?? `旅行路线 ${index + 1}`;
}

export function DetailedMapExperience() {
  const router = useRouter();
  const mapRef = useRef<DetailedMapCanvasHandle>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const styleTrayCloseTimerRef = useRef<number | null>(null);
  const fullscreenPanelStateRef = useRef<{ planner: boolean; right: boolean; dock: boolean } | null>(null);

  // 默认使用 Leaflet + OpenStreetMap 真实地理底图风格（首期主导）
  const [mapEngine, setMapEngine] = useState<"leaflet" | "amap">("leaflet");
  const [mode, setMode] = useState<AmapPresentationModeId>("amap-original");
  const [visibleLayers, setVisibleLayers] = useState<Record<MapLayerId, boolean>>({ ...DEFAULT_VISIBLE_MAP_LAYERS });
  const [facilitySubtypes] = useState<FacilitySubtype[]>([...FACILITY_SUBTYPES]);
  const [catalog, setCatalog] = useState<DetailedMapCatalog>(emptyCatalog);
  const [providerState, setProviderState] = useState<DetailedMapProviderState>(initialProviderState);
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<MapSearchResult | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<MapPoi | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string>();
  const [panelMode, setPanelMode] = useState<"route" | "discover" | "social">("route");
  const [socialLayerVisible, setSocialLayerVisible] = useState(false);
  const [exhibitionLayers, setExhibitionLayers] = useState({ ...DEFAULT_DIGITAL_EXHIBITION_LAYERS });
  const [endSpotId, setEndSpotId] = useState(scenicSpots[1]?.id ?? "");
  const [layersOpen, setLayersOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [styleTrayState, setStyleTrayState] = useState<"closed" | "preview" | "pinned">("closed");
  const [plannerCollapsed, setPlannerCollapsed] = useState(true);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [routeDockCollapsed, setRouteDockCollapsed] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notice, setNotice] = useState("公开地图资料 · 出发前请核对现场开放与通行信息");
  const portalVersion = usePortalVersion();
  const portalActivities = useMemo(() => PortalDemoRepository.getActivities({ status: "published" }), [portalVersion]);

  const searchResults = useMemo(() => searchMapCatalog(query, scenicSpots, catalog.pois, 16), [catalog.pois, query]);
  const selectedRoute = catalog.routes.find((route) => route.id === selectedRouteId) ?? null;
  const selectedRouteIndex = selectedRoute ? catalog.routes.findIndex((route) => route.id === selectedRoute.id) : -1;
  const usesAmapProvider = providerState.provider === "amap-jsapi-v2";
  const selectedSpot = selectedSpotId ? scenicSpots.find((spot) => spot.id === selectedSpotId) ?? null : null;
  const selectedSpotImage = selectedSpot ? getScenicSpotImage(selectedSpot.id as ScenicSpotId) : null;
  const exhibitionActive = DIGITAL_EXHIBITION_LAYERS.some((layer) => exhibitionLayers[layer.id]);

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 760px)");
    const disableHighCostMobileLayers = () => {
      if (compactViewport.matches) {
        setLayersOpen(false);
        setExhibitionLayers((current) => {
          const next = { ...current };
          MOBILE_EXHIBITION_LAYERS.forEach((layerId) => { next[layerId] = false; });
          return next;
        });
      }
    };
    disableHighCostMobileLayers();
    compactViewport.addEventListener("change", disableHighCostMobileLayers);
    return () => compactViewport.removeEventListener("change", disableHighCostMobileLayers);
  }, []);

  useEffect(() => () => {
    if (styleTrayCloseTimerRef.current !== null) window.clearTimeout(styleTrayCloseTimerRef.current);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const nextIsFullscreen = document.fullscreenElement === workspaceRef.current;
      setIsFullscreen(nextIsFullscreen);
      if (!nextIsFullscreen && fullscreenPanelStateRef.current) {
        setPlannerCollapsed(fullscreenPanelStateRef.current.planner);
        setRightPanelCollapsed(fullscreenPanelStateRef.current.right);
        setRouteDockCollapsed(fullscreenPanelStateRef.current.dock);
        fullscreenPanelStateRef.current = null;
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || styleTrayState === "closed") return;
      setStyleTrayState("closed");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [styleTrayState]);

  function toggleLayer(layerId: MapLayerId) {
    setVisibleLayers((current) => ({ ...current, [layerId]: !current[layerId] }));
  }

  function toggleAmapPlacesAndFacilities() {
    setVisibleLayers((current) => {
      const next = !(current.places || current.facilities);
      return { ...current, places: next, facilities: next };
    });
  }

  function chooseSearchResult(result: MapSearchResult) {
    setFocusTarget(result);
    setSelectedRouteId(null);
    setSelectedSpotId(result.kind === "SCENIC_SPOT" ? result.id : undefined);
    setSelectedPoi(result.kind === "OSM_POI" ? catalog.pois.find((poi) => poi.id === result.id) ?? null : null);
    setNotice(`${result.name} · ${result.verification}`);
  }

  function chooseSpot(spotId: string) {
    const spot = scenicSpots.find(({ id }) => id === spotId);
    if (!spot) return;
    setSelectedSpotId(spot.id);
    setSelectedRouteId(null);
    setEndSpotId(spot.id);
    setSelectedPoi(null);
    setFocusTarget({
      id: spot.id,
      kind: "SCENIC_SPOT",
      name: spot.name,
      detail: spot.subtitle,
      coordinates: [spot.longitude, spot.latitude],
      verification: `${spot.verification} · 未经现场核验`,
    });
    setNotice(`${spot.name} · ${spot.verification} · 未经现场核验`);
  }

  function chooseRoute(routeId: string) {
    const route = catalog.routes.find((item) => item.id === routeId);
    if (!route) return;
    setSelectedRouteId(route.id);
    setSelectedSpotId(undefined);
    setSelectedPoi(null);
    setFocusTarget(null);
    setEndSpotId(route.to);
    setNotice("已切换到参考路线；距离可用于行前了解，实际耗时请以现场为准。");
  }

  function requestNavigationPreview() {
    setNotice("当前没有可用于内部导航的已发布路线；地图不会调用高德计算景区内部路线。");
  }

  function clearStyleTrayCloseTimer() {
    if (styleTrayCloseTimerRef.current === null) return;
    window.clearTimeout(styleTrayCloseTimerRef.current);
    styleTrayCloseTimerRef.current = null;
  }

  function previewStyleTray() {
    clearStyleTrayCloseTimer();
    setStyleTrayState((current) => current === "pinned" ? current : "preview");
  }

  function scheduleStyleTrayClose() {
    if (styleTrayState === "pinned") return;
    clearStyleTrayCloseTimer();
    styleTrayCloseTimerRef.current = window.setTimeout(() => {
      setStyleTrayState("closed");
      styleTrayCloseTimerRef.current = null;
    }, 240);
  }

  function toggleStyleTray() {
    clearStyleTrayCloseTimer();
    setStyleTrayState((current) => current === "pinned" ? "closed" : "pinned");
  }

  function selectPresentationMode(modeId: AmapPresentationModeId) {
    const item = MAP_PRESENTATION_MODES.find((candidate) => candidate.id === modeId);
    if (!item) return;
    setMapEngine("amap");
    setMode(item.id);
    setNotice(`${item.name}：${item.disclosure}`);
  }

  function toggleExhibitionLayer(layerId: DigitalExhibitionLayerId) {
    const layer = getDigitalExhibitionLayer(layerId);
    if (!layer.renderableNow) {
      setNotice(`${layer.label}：${layer.visitorMeaning}`);
      return;
    }
    setExhibitionLayers((current) => ({ ...current, [layerId]: !current[layerId] }));
    setNotice(`${layer.label}：${layer.visitorMeaning}`);
  }

  function enableExhibitionPresentation() {
    setExhibitionLayers((current) => ({
      ...current,
      "core-ripples": true,
      "ordinary-bubbles": true,
      "culture-links": true,
      "heat-demo": true,
      "ambient-particles": true,
    }));
    setNotice(DIGITAL_EXHIBITION_DISCLOSURE);
  }

  async function toggleFullscreen() {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    try {
      if (document.fullscreenElement === workspace) {
        await document.exitFullscreen();
        return;
      }
      fullscreenPanelStateRef.current = {
        planner: plannerCollapsed,
        right: rightPanelCollapsed,
        dock: routeDockCollapsed,
      };
      setPlannerCollapsed(true);
      setRightPanelCollapsed(true);
      setRouteDockCollapsed(true);
      await workspace.requestFullscreen();
    } catch {
      const previousPanels = fullscreenPanelStateRef.current;
      if (previousPanels) {
        setPlannerCollapsed(previousPanels.planner);
        setRightPanelCollapsed(previousPanels.right);
        setRouteDockCollapsed(previousPanels.dock);
      }
      fullscreenPanelStateRef.current = null;
      setNotice("当前浏览器不支持全屏地图，可继续在页面内浏览。");
    }
  }

  return (
    <section
      ref={workspaceRef}
      className="map-tour-workspace"
      data-mobile-panel-open={mobilePanelOpen ? "true" : "false"}
      data-map-mode={mode}
      data-style-tray={styleTrayState}
      data-planner-collapsed={plannerCollapsed ? "true" : "false"}
      data-right-panel-collapsed={rightPanelCollapsed ? "true" : "false"}
      data-route-dock-collapsed={routeDockCollapsed ? "true" : "false"}
      data-map-fullscreen={isFullscreen ? "true" : "false"}
      aria-labelledby="detailed-map-workspace-title"
    >
      <h2 id="detailed-map-workspace-title" className="sr-only">六祖云游详细地图</h2>
      <div className="map-tour-canvas map-shell">
        {mapEngine === "leaflet" ? (
          <LeafletMapView
            initialCenter={[22.596, 112.218]}
            initialZoom={14}
            onSelectObject={(obj) => {
              if (obj && obj.sourceId) {
                chooseSpot(obj.sourceId);
              }
            }}
          />
        ) : null}

        <div style={{ display: mapEngine === "amap" ? "block" : "none", width: "100%", height: "100%" }}>
          <DetailedMapSurface
            ref={mapRef}
            variant="full"
            mode={mode}
            visibleLayers={visibleLayers}
            facilitySubtypes={facilitySubtypes}
            selectedRouteId={selectedRouteId}
            focusTarget={focusTarget}
            selectedSpotId={selectedSpotId}
            onSpotSelect={chooseSpot}
            socialLayerVisible={socialLayerVisible}
            onSocialSpotSelect={(spotId) => router.push(`/community/${spotId}`)}
            exhibitionLayers={exhibitionLayers}
            onMapBlankClick={() => { setSelectedSpotId(undefined); setSelectedPoi(null); }}
            onInteractionNotice={setNotice}
            onProviderChange={setProviderState}
            onCatalogReady={(nextCatalog) => {
              setCatalog(nextCatalog);
              setSelectedRouteId((current) => current);
            }}
            onPoiSelect={(poi) => {
              setSelectedSpotId(undefined);
              setSelectedPoi(poi);
              setFocusTarget({ id: poi.id, kind: "OSM_POI", name: poi.name, detail: `${poi.category} · ${poi.subtype}`, coordinates: poi.coordinates, verification: "公开地图资料 · 请以现场为准" });
              setNotice(`${poi.name} · 公开地图资料 · 请以现场为准`);
            }}
          />
        </div>
      </div>

      <nav
        className="map-tour-style-tray"
        aria-label="地图风格与展馆展示层"
        onPointerEnter={previewStyleTray}
        onPointerLeave={scheduleStyleTrayClose}
        onFocusCapture={previewStyleTray}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleStyleTrayClose();
        }}
      >
        <button
          type="button"
          className="map-tour-style-trigger"
          onClick={toggleStyleTray}
          aria-expanded={styleTrayState !== "closed"}
          aria-controls="map-style-tray-panel"
        >
          <SlidersHorizontal size={17} weight="duotone" aria-hidden="true" />
          <span>地图风格与展示层</span>
          <small>{mapEngine === "leaflet" ? "云游真实底图" : (MAP_PRESENTATION_MODES.find((item) => item.id === mode)?.name ?? "标准地图")}</small>
          {styleTrayState === "closed" ? <CaretDown size={16} aria-hidden="true" /> : <CaretUp size={16} aria-hidden="true" />}
        </button>
        <div id="map-style-tray-panel" className="map-tour-style-tray-panel">
          <div className="map-tour-style-tray-heading">
            <div><strong>底图风格</strong><p>只改变观看风格，保留高德道路、点位、文字与官方边界。</p></div>
            <button type="button" onClick={enableExhibitionPresentation} className="map-tour-exhibit-preset"><Sparkle size={15} weight="fill" />开启展馆演示</button>
          </div>
          <div className="map-tour-style-grid" role="group" aria-label="选择地图底图风格">
            <button
              type="button"
              onClick={() => {
                setMapEngine("leaflet");
                setNotice("云游真实底图：基于 OpenStreetMap 真实地理底图与高德路径导航。");
              }}
              aria-pressed={mapEngine === "leaflet"}
            >
              <span className="map-tour-theme-swatch map-tour-theme-swatch--zen" aria-hidden="true" />
              <strong>云游真实底图</strong>
              <small>Leaflet + OSM 真实地理细节</small>
            </button>
            {MAP_PRESENTATION_MODES.map((item) => (
              <button key={item.id} type="button" onClick={() => selectPresentationMode(item.id)} aria-pressed={mapEngine === "amap" && mode === item.id}>
                <span className={`map-tour-theme-swatch map-tour-theme-swatch--${item.id}`} aria-hidden="true" />
                <strong>{item.name}</strong>
                <small>{item.shortDescription}</small>
              </button>
            ))}
          </div>
          <div className="map-tour-exhibit-heading"><strong>展馆展示层</strong><span>可多选</span></div>
          <div className="map-tour-exhibit-grid" role="group" aria-label="选择数字展馆展示图层">
            {DIGITAL_EXHIBITION_LAYERS.map((layer) => (
              <button
                key={layer.id}
                type="button"
                data-layer={layer.id}
                data-data-state={layer.dataState}
                disabled={!layer.renderableNow}
                aria-pressed={exhibitionLayers[layer.id]}
                onClick={() => toggleExhibitionLayer(layer.id)}
              >
                <span className="map-tour-legend-glyph" data-kind={layer.id} aria-hidden="true" />
                <span><strong>{layer.label}</strong><small>{layer.visitorMeaning}</small></span>
              </button>
            ))}
          </div>
          <p className="map-tour-exhibit-disclosure">{DIGITAL_EXHIBITION_DISCLOSURE}</p>
        </div>
      </nav>

      <button type="button" className="map-tour-mobile-planner" onClick={() => setMobilePanelOpen((current) => !current)} aria-expanded={mobilePanelOpen} aria-controls="map-route-panel">
        <MapTrifold size={19} weight="duotone" aria-hidden="true" />路线规划<CaretDown size={16} className={mobilePanelOpen ? "rotate-180" : ""} aria-hidden="true" />
      </button>

      <aside id="map-route-panel" className="map-tour-planner" aria-label="路线规划与景点探索">
        <div className="map-tour-panel-tabs" role="tablist" aria-label="地图任务">
          <button type="button" role="tab" aria-selected={panelMode === "route"} onClick={() => setPanelMode("route")}><MapTrifold size={19} weight={panelMode === "route" ? "fill" : "duotone"} />路线规划</button>
          <button type="button" role="tab" aria-selected={panelMode === "discover"} onClick={() => setPanelMode("discover")}><MapPin size={19} weight={panelMode === "discover" ? "fill" : "duotone"} />景点探索</button>
          <button type="button" role="tab" aria-selected={panelMode === "social"} onClick={() => { setPanelMode("social"); setSocialLayerVisible(true); }}><UsersThree size={19} weight={panelMode === "social" ? "fill" : "duotone"} />地点社区</button>
          <button type="button" className="map-tour-close-panel" onClick={() => setMobilePanelOpen(false)} aria-label="收起路线面板"><X size={18} /></button>
          <button type="button" className="map-tour-desktop-collapse" onClick={() => setPlannerCollapsed(true)} aria-label="收起路线规划" aria-expanded={!plannerCollapsed}><CaretLeft size={18} /></button>
        </div>

        {panelMode === "route" ? (
          <div className="map-tour-planner-scroll">
            <section className="map-tour-route-form" aria-label="公开道路导航目的地">
              <div className="map-tour-stop-input" data-stop="start"><span className="map-tour-stop-dot" aria-hidden="true" /><label htmlFor="map-start">起点</label><input id="map-start" value="我的当前位置（由高德获取）" readOnly /></div>
              <div className="map-tour-stop-input" data-stop="end"><span className="map-tour-stop-dot" aria-hidden="true" /><label htmlFor="map-end">终点</label><select id="map-end" value={endSpotId} onChange={(event) => { setEndSpotId(event.target.value); chooseSpot(event.target.value); }}>{scenicSpots.map((spot) => <option key={spot.id} value={spot.id}>{spot.name}</option>)}</select></div>
            </section>

            <PublicNavigationPanel destinationName={spotNames.get(endSpotId) ?? "国恩寺"} />
            {FICTIONAL_NAVIGATION_LAB_ENABLED ? (
              <Link href="/navigation-lab" className="map-tour-simulation-link">
                <Compass size={18} weight="duotone" aria-hidden="true" />
                打开完全虚构的导航实验室
              </Link>
            ) : null}

            <section className="map-tour-route-list" aria-labelledby="map-route-list-title">
              <div className="map-tour-section-heading"><h2 id="map-route-list-title">景区参考路线</h2><span>内部步道请以现场为准</span></div>
              {catalog.routes.length === 0 ? <div className="map-tour-route-skeleton" role="status">正在读取旅行路线…</div> : (
                <ul>{catalog.routes.slice(0, 4).map((route, index) => (
                  <li key={route.id}><button type="button" onClick={() => chooseRoute(route.id)} aria-pressed={selectedRouteId === route.id}>
                    <span className="map-tour-route-number">{index + 1}</span>
                    <span className="map-tour-route-copy"><strong>{routeName(index)}</strong><span>{spotNames.get(route.from) ?? route.from} → {spotNames.get(route.to) ?? route.to}</span><small>{formatMapDistance(route.distanceMeters)} · 步行耗时待核验</small></span>
                    <ChartLineUp className="map-tour-mini-profile" size={32} weight="duotone" aria-hidden="true" />
                  </button></li>
                ))}</ul>
              )}
            </section>

            <section className="map-tour-favorites" aria-labelledby="map-favorite-title">
              <div className="map-tour-section-heading"><h2 id="map-favorite-title">我的收藏</h2><Link href="/journey">查看全部</Link></div>
              <ul>{scenicSpots.slice(0, 3).map((spot) => (
                <li key={spot.id}><button type="button" onClick={() => chooseSpot(spot.id)}><span className={`map-tour-favorite-icon map-tour-favorite-icon--${spot.category}`}><Mountains size={16} weight="fill" /></span><span><strong>{spot.name}</strong><small>{spot.category} · 景点资料</small></span><Star size={19} /></button></li>
              ))}</ul>
            </section>
          </div>
        ) : panelMode === "discover" ? (
          <div className="map-tour-discover-panel">
            <label htmlFor="map-search"><MagnifyingGlass size={18} />搜索已加载地点</label>
            <div className="map-tour-search-box"><MagnifyingGlass size={17} /><input id="map-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="国恩寺、村庄、停车点…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button> : null}</div>
            <p className="map-tour-search-note">结果来自已登记景点与公开地图资料；开放状态请以景区现场为准。</p>
            <ul className="map-tour-search-results" aria-live="polite">
              {query.trim() && searchResults.length === 0 ? <li className="map-tour-empty-result">没有找到匹配地点。</li> : null}
              {searchResults.map((result) => <li key={`${result.kind}-${result.id}`}><button type="button" onClick={() => chooseSearchResult(result)}><MapPin size={18} weight="duotone" /><span><strong>{result.name}</strong><small>{result.detail}<br />{result.verification}</small></span><CaretRight size={16} /></button></li>)}
            </ul>
          </div>
        ) : (
          <div className="map-tour-community-panel">
            <div className="map-tour-community-heading"><ChatsCircle size={22} weight="duotone" /><div><strong>地点社区</strong><p>点击地图标记进入对应地点的讨论区；内容数量不代表实时客流或热度。</p></div></div>
            <ul>{SOCIAL_COMMUNITIES.map((community) => (
              <li key={community.id}>
                <Link href={`/community/${community.placeId}`}>
                  <span className="map-tour-community-dot"><UsersThree size={17} weight="fill" /></span>
                  <span><strong>{community.name}</strong><small>{community.demoPostCount} 条社区分享<br />浏览照片、话题与游玩灵感</small></span>
                  <CaretRight size={16} />
                </Link>
              </li>
            ))}</ul>
          </div>
        )}
      </aside>
      <button type="button" className="map-tour-panel-handle map-tour-panel-handle--left" onClick={() => setPlannerCollapsed(false)} aria-label="展开路线规划" aria-expanded={!plannerCollapsed}>
        <MapTrifold size={18} weight="duotone" /><span>路线规划</span><CaretRight size={15} />
      </button>

      <div className="map-tour-compass" aria-hidden="true"><Compass size={29} weight="duotone" /><span>N</span></div>
      <div className="map-tour-status" role="status" aria-live="polite" aria-atomic="true" title={providerState.message}><Info size={15} weight="fill" /><span>{notice}</span></div>
      <aside className="map-tour-exhibition-status" data-active={exhibitionActive ? "true" : "false"} aria-label="展馆数据状态">
        <span className="map-tour-exhibition-status-kicker">数字展馆 · 数据状态</span>
        <p>{DIGITAL_EXHIBITION_DISCLOSURE}</p>
      </aside>

      <div className="map-tour-layer-zone">
        <div className="map-tour-right-panel-actions">
          <button type="button" className="map-tour-layer-toggle" onClick={() => setLayersOpen((current) => !current)} aria-expanded={layersOpen}><Stack size={18} weight="duotone" />图层与图例</button>
          <button type="button" className="map-tour-right-collapse" onClick={() => setRightPanelCollapsed(true)} aria-label="收起图层与图例" aria-expanded={!rightPanelCollapsed}><CaretRight size={17} /></button>
        </div>
        {layersOpen ? <>
          <fieldset className="map-tour-layer-panel"><legend>基础图层</legend>
            {usesAmapProvider ? (
              <label title="高德公开底图不能把地点与设施两个点图层完全分离"><input type="checkbox" checked={visibleLayers.places || visibleLayers.facilities} onChange={toggleAmapPlacesAndFacilities} /><span><Check size={12} /></span>高德地点与设施</label>
            ) : (
              <>
                <label><input type="checkbox" checked={visibleLayers.places} onChange={() => toggleLayer("places")} /><span><Check size={12} /></span>景点标注</label>
                <label><input type="checkbox" checked={visibleLayers.facilities} onChange={() => toggleLayer("facilities")} /><span><Check size={12} /></span>服务设施</label>
              </>
            )}
            <label><input type="checkbox" checked={visibleLayers.roads} onChange={() => toggleLayer("roads")} /><span><Check size={12} /></span>道路与步道</label>
            <label><input type="checkbox" checked={visibleLayers.buildings} onChange={() => toggleLayer("buildings")} /><span><Check size={12} /></span>建筑</label>
            {usesAmapProvider ? (
              <label aria-disabled="true" title="公开水系随高德底图显示，当前不能独立关闭"><input type="checkbox" checked disabled /><span><Check size={12} /></span>水系随高德底图</label>
            ) : (
              <label><input type="checkbox" checked={visibleLayers.water} onChange={() => toggleLayer("water")} /><span><Check size={12} /></span>水系</label>
            )}
            {usesAmapProvider ? (
              <label aria-disabled="true" title="景区内部步行路线正在整理"><input type="checkbox" checked={false} disabled /><span><Check size={12} /></span>景区步道暂不可用</label>
            ) : (
              <label><input type="checkbox" checked={visibleLayers.routes} onChange={() => toggleLayer("routes")} /><span><Check size={12} /></span>旅行路线</label>
            )}
            <label><input type="checkbox" checked={socialLayerVisible} onChange={(event) => { setSocialLayerVisible(event.target.checked); if (event.target.checked) setPanelMode("social"); }} /><span><Check size={12} /></span>地点社区入口</label>
          </fieldset>
          <aside className="map-tour-legend-panel" aria-label="地图视觉图例">
            <div><strong>看图说明</strong><span>展示层均有文字说明</span></div>
            <ul>
              {DIGITAL_EXHIBITION_LAYERS.filter((layer) => ["core-ripples", "ordinary-bubbles", "culture-links", "route-flow", "theme-zones", "heat-demo", "comparison-columns"].includes(layer.id)).map((layer) => (
                <li key={layer.id}><span className="map-tour-legend-glyph" data-kind={layer.id} aria-hidden="true" /><span><strong>{layer.legendLabel}</strong><small>{layer.visitorMeaning}</small></span></li>
              ))}
            </ul>
          </aside>
        </> : null}
      </div>
      <button type="button" className="map-tour-panel-handle map-tour-panel-handle--right" onClick={() => setRightPanelCollapsed(false)} aria-label="展开图层与图例" aria-expanded={!rightPanelCollapsed}>
        <Stack size={18} weight="duotone" /><span>图层与图例</span><CaretLeft size={15} />
      </button>

      <nav className="map-tour-map-tools" aria-label="地图工具">
        <button type="button" onClick={() => mapRef.current?.resetView()}><Eye size={20} weight="duotone" /><span>全景</span></button>
        <Link href="/admin/map-editor"><Path size={20} weight="duotone" /><span>路线</span></Link>
        <button type="button" onClick={() => mapRef.current?.locate()}><Crosshair size={20} weight="duotone" /><span>定位</span></button>
        <button type="button" onClick={() => void toggleFullscreen()} aria-pressed={isFullscreen}>{isFullscreen ? <CornersIn size={20} weight="duotone" /> : <CornersOut size={20} weight="duotone" />}<span>{isFullscreen ? "退出全屏" : "全屏地图"}</span></button>
      </nav>
      <div className="map-tour-zoom" aria-label="地图缩放"><button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="放大地图"><Plus size={20} /></button><button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="缩小地图"><Minus size={20} /></button></div>

      <section className="map-tour-route-dock" aria-live="polite" aria-label="路线与详情">
        <button type="button" className="map-tour-dock-collapse" onClick={() => setRouteDockCollapsed(true)} aria-label="收起路线与详情" aria-expanded={!routeDockCollapsed}><CaretDown size={17} /><span>收起路线与详情</span></button>
        {selectedRoute ? <><div className="map-tour-dock-heading"><div><span className="map-tour-dock-kicker">参考路线 · 出发前请核对</span><h2>{routeName(selectedRouteIndex)}</h2><p>{formatMapDistance(selectedRoute.distanceMeters)} · 实际耗时请以现场为准</p></div><div className="map-tour-dock-actions"><button type="button" onClick={() => setNotice(selectedRoute.warning)}>路线说明</button><button type="button" className="map-tour-navigation-button" onClick={requestNavigationPreview}>查看导航条件</button></div></div>
          <ol className="map-tour-route-timeline"><li><span>1</span><strong>{spotNames.get(selectedRoute.from) ?? selectedRoute.from}</strong><small>路线起点</small></li><li className="map-tour-route-segment"><span>{formatMapDistance(selectedRoute.distanceMeters)}</span></li><li><span>2</span><strong>{spotNames.get(selectedRoute.to) ?? selectedRoute.to}</strong><small>路线终点</small></li></ol></> : <div className="map-tour-dock-empty"><RoadHorizon size={24} /><span>{selectedSpot ? `已选择${selectedSpot.name}；可在上方资料卡查看候选点位说明。` : "从左侧选择一条旅行路线，或点击地图标记查看地点资料。"}</span></div>}
      </section>
      <button type="button" className="map-tour-panel-handle map-tour-panel-handle--bottom" onClick={() => setRouteDockCollapsed(false)} aria-label="展开路线与详情" aria-expanded={!routeDockCollapsed}>
        <RoadHorizon size={18} weight="duotone" /><span>路线与详情</span><CaretUp size={15} />
      </button>

      {selectedSpot ? <aside className="map-tour-spot-detail" aria-live="polite" aria-label={`${selectedSpot.name}地点资料`}>
        <button type="button" onClick={() => setSelectedSpotId(undefined)} aria-label="关闭景点资料"><X size={17} /></button>
        <div className="map-tour-spot-detail-main">
          {selectedSpotImage ? <div className="map-tour-spot-image"><Image src={selectedSpotImage.asset.src} alt={selectedSpotImage.asset.alt} fill sizes="152px" className="object-cover" priority /></div> : <div className="map-tour-spot-image map-tour-spot-image--fallback" aria-hidden="true"><MapPin size={25} weight="duotone" /></div>}
          <div><span className="map-tour-spot-kicker">候选地点资料</span><strong>{selectedSpot.name}</strong><p>{selectedSpot.subtitle}</p></div>
        </div>
        <p className="map-tour-spot-status">资料状态：{selectedSpot.verification} · 未经现场核验</p>
        <Link href={`/community/${selectedSpot.id}`} className="map-tour-spot-link">查看地点资料<ArrowRight size={15} /></Link>
      </aside> : null}

      {selectedPoi ? <aside className="map-tour-poi-card" aria-live="polite"><button type="button" onClick={() => setSelectedPoi(null)} aria-label="关闭地点详情"><X size={17} /></button><span className="map-tour-poi-kicker">地图地点</span><strong>{selectedPoi.name}</strong><p>{selectedPoi.category} · {selectedPoi.subtype}<br />到访前请确认当天开放信息</p><a href={selectedPoi.sourceUrl} target="_blank" rel="noreferrer">查看地图来源<ArrowRight size={15} /></a></aside> : null}

      {/* 实时新发布文旅体验与活动快捷卡片（仅在展开探索时展示，避免遮挡主地图） */}
      {portalActivities.length > 0 && !plannerCollapsed ? (
        <aside aria-label="最新发布文旅体验" className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-stone-900/90 text-white backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-amber-500/40 text-xs max-w-[90vw] overflow-x-auto scrollbar-none">
          <span className="text-amber-400 font-bold flex items-center gap-1 shrink-0">
            <Sparkle size={15} weight="fill" />
            <span>最新文旅体验：</span>
          </span>
          {portalActivities.map((act) => (
            <Link
              key={act.id}
              href={`/activity/${act.id}`}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white px-2.5 py-1 rounded-xl shrink-0 transition-colors flex items-center gap-1 font-medium border border-stone-700"
            >
              <span>{act.name}</span>
              <ArrowRight size={12} />
            </Link>
          ))}
        </aside>
      ) : null}

      <div className="map-tour-mobile-quickbar" aria-label="移动地图快捷操作"><button type="button" onClick={() => mapRef.current?.resetView()}><Compass size={18} />全景</button><button type="button" onClick={() => setLayersOpen((current) => !current)}><Stack size={18} />图层</button><button type="button" onClick={() => mapRef.current?.locate()}><Crosshair size={18} />定位</button><button type="button" onClick={() => { setPanelMode("discover"); setMobilePanelOpen(true); }}><MagnifyingGlass size={18} />搜索</button></div>
      <div className="map-tour-mobile-sheet-scrim" onClick={() => setMobilePanelOpen(false)} aria-hidden="true" />
    </section>
  );
}

