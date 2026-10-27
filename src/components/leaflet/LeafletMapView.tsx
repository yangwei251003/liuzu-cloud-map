"use client";

import { useEffect, useRef, useState, useId, useMemo, forwardRef, useImperativeHandle } from "react";
import Link from "next/link";
import {
  Compass,
  MagnifyingGlass,
  ArrowRight,
  Sparkle,
  Path,
  NavigationArrow,
  Star,
  ChatCircleDots,
  MapPin,
  X,
  CaretRight,
  ArrowsClockwise,
  ArrowUpRight,
} from "@phosphor-icons/react";
import type { L, LeafletType } from "@/types/leaflet";
import { loadLeaflet } from "@/lib/leaflet/loader";
import { createMapIcon, createUserLocationIcon } from "@/lib/leaflet/markers";
import { getDeviceCurrentLocation, LIUZU_DEFAULT_LOCATION, type LocationResult } from "@/lib/leaflet/location";
import { calculateNavigationRoute, type NavigationRouteResult } from "@/lib/leaflet/routing";
import type { MapObject, MapFilterCategory } from "@/lib/map/map-object";
import { MAP_FILTER_OPTIONS } from "@/lib/map/map-object";
import Image from "next/image";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import { LIUZU_BRAND_ASSETS } from "@/lib/brand-assets";
import { getAllMapObjects, fetchMapObjects, searchMapObjects } from "@/lib/map/api";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import styles from "./LeafletMapView.module.css";
import "./LeafletMarkers.css";

export type LeafletMapViewHandle = {
  resetView: () => void;
  locate: () => void;
  selectObject: (id: string) => void;
  startNavigation: (target: MapObject) => void;
};

export type LeafletMapViewProps = {
  initialCenter?: [number, number];
  initialZoom?: number;
  selectedId?: string | null;
  onSelectObject?: (obj: MapObject | null) => void;
  className?: string;
};

export const LeafletMapView = forwardRef<LeafletMapViewHandle, LeafletMapViewProps>(function LeafletMapView(
  { initialCenter = [22.596, 112.218], initialZoom = 14, selectedId, onSelectObject, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<LeafletType | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  // 关键：用 ref 追踪地图就绪状态和缓存数据，解决竞态问题
  const mapReadyRef = useRef(false);
  const mapObjectsCacheRef = useRef<MapObject[]>([]);
  const activeFilterCacheRef = useRef<MapFilterCategory>("featured");
  // 关键：用 ref 追踪当前选中 ID，避免 React 重渲染导致 Marker 销毁
  const selectedIdRef = useRef<string | null>(null);

  const portalVersion = usePortalVersion();

  // 状态管理
  const [mapObjects, setMapObjects] = useState<MapObject[]>([]);
  const [activeFilter, setActiveFilter] = useState<MapFilterCategory>("featured");
  const [selectedObject, setSelectedObject] = useState<MapObject | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapObject[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<LocationResult | null>(null);
  const [activeRoute, setActiveRoute] = useState<NavigationRouteResult | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const searchInputId = useId();

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }

  // ── 核心 Marker 渲染函数（命令式，不依赖 React 重渲染）──
  function renderMarkers(L: LeafletType, map: L.Map, objs: MapObject[], filter: MapFilterCategory) {
    // 清除旧 Markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const visible = objs.filter((obj) =>
      filter === "featured" ? obj.featured !== false : obj.type === filter
    );

    visible.forEach((obj) => {
      const icon = createMapIcon(L, obj, false);
      const marker = L.marker(obj.coordinates, { icon, title: obj.title, keyboard: true }).addTo(map);
      marker.on("click", () => handleSelectObject(obj));
      markersRef.current.set(obj.id, marker);
    });
  }

  // 1. 加载全量地图数据，数据来了就立即尝试渲染 Markers
  useEffect(() => {
    getAllMapObjects().then((objs) => {
      setMapObjects(objs);
      mapObjectsCacheRef.current = objs;
      // 如果地图已经就绪，立即添加 Markers（解决数据先于地图就绪的竞态）
      const map = mapInstanceRef.current;
      const L = leafletRef.current;
      if (mapReadyRef.current && map && L) {
        renderMarkers(L, map, objs, activeFilterCacheRef.current);
      }
    });
  }, [portalVersion]);

  // 2. 初始化 Leaflet 地图与 OpenStreetMap 瓦片
  useEffect(() => {
    let isCancelled = false;

    loadLeaflet().then((L) => {
      if (isCancelled || !containerRef.current || mapInstanceRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        center: initialCenter,
        zoom: initialZoom,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      map.on("click", () => {
        setSearchOpen(false);
        setNearbyOpen(false);
      });

      mapInstanceRef.current = map;
      mapReadyRef.current = true;

      // 地图就绪后，如果数据已经加载完成，立即添加 Markers（解决地图先于数据就绪的竞态）
      if (mapObjectsCacheRef.current.length > 0) {
        renderMarkers(L, map, mapObjectsCacheRef.current, activeFilterCacheRef.current);
      }
    });

    return () => {
      isCancelled = true;
      mapReadyRef.current = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [initialCenter, initialZoom]);

  // 3. 分类筛选变化时重渲染 Markers
  useEffect(() => {
    activeFilterCacheRef.current = activeFilter;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!mapReadyRef.current || !map || !L || mapObjectsCacheRef.current.length === 0) return;
    renderMarkers(L, map, mapObjectsCacheRef.current, activeFilter);
  }, [activeFilter]);

  // 4. 选中交互：直接操作 DOM CSS class，完全不触发 React 重渲染或 Marker 销毁
  function handleSelectObject(obj: MapObject | null) {
    // 移除上一个选中的 CSS class
    if (selectedIdRef.current) {
      const prevMarker = markersRef.current.get(selectedIdRef.current);
      if (prevMarker) {
        const el = prevMarker.getElement();
        el?.querySelector(".liuzu-marker-anchor")?.classList.remove("selected");
      }
    }

    // 给新选中的点位添加 CSS class
    if (obj) {
      const marker = markersRef.current.get(obj.id);
      if (marker) {
        const el = marker.getElement();
        el?.querySelector(".liuzu-marker-anchor")?.classList.add("selected");
      }
    }

    selectedIdRef.current = obj?.id ?? null;
    setSelectedObject(obj);
    if (onSelectObject) onSelectObject(obj);

    if (obj && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(obj.coordinates, 16, { animate: true, duration: 0.75 });
    }
  }

  // 5. 真实定位
  async function handleLocate() {
    setIsLocating(true);
    showToast("正在获取真实 GPS 位置…");
    const loc = await getDeviceCurrentLocation();
    setUserLocation(loc);
    setIsLocating(false);

    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (map && L) {
      if (userMarkerRef.current) userMarkerRef.current.remove();

      const userIcon = createUserLocationIcon(L);
      const userMarker = L.marker(loc.coords, { icon: userIcon, title: "我的当前位置" }).addTo(map);
      userMarkerRef.current = userMarker;

      map.setView(loc.coords, 16, { animate: true });
      showToast(`定位完成 · 精度约 ${loc.accuracy} 米`);
    }
  }

  // 6. 规划高德导航路线并在 Leaflet 地图上渲染
  async function handleStartNavigation(target: MapObject) {
    const originCoords = userLocation ? userLocation.coords : LIUZU_DEFAULT_LOCATION;
    showToast(`正在规划前往【${target.title}】的路线…`);

    const route = await calculateNavigationRoute(originCoords, target.coordinates, target.title, "walking");
    setActiveRoute(route);

    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (map && L) {
      if (routePolylineRef.current) routePolylineRef.current.remove();

      // 绘制贴合真实道路的高德导航折线
      const poly = L.polyline(route.polyline, {
        color: "#174a3a",
        weight: 6,
        opacity: 0.9,
        dashArray: "3 8",
        lineCap: "round",
      }).addTo(map);

      routePolylineRef.current = poly;
      map.fitBounds(poly.getBounds(), { padding: [80, 80] });
    }
  }

  function handleCancelRoute() {
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    setActiveRoute(null);
    showToast("路线导航已结束");
  }

  // 7. 搜索功能
  function handleSearchInput(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchMapObjects(q, 6).then((res) => setSearchResults(res));
  }

  // 快捷键 `/`
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setSearchOpen(true);
        const input = document.getElementById(searchInputId);
        input?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchInputId]);

  // 8. 收藏
  function handleToggleSave(id: string, title: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast(`已取消收藏“${title}”`);
      } else {
        next.add(id);
        showToast(`已收藏“${title}”`);
      }
      return next;
    });
  }

  // 暴露句柄
  useImperativeHandle(ref, () => ({
    resetView: () => {
      mapInstanceRef.current?.setView(initialCenter, initialZoom, { animate: true });
    },
    locate: handleLocate,
    selectObject: (id) => {
      const found = mapObjects.find((o) => o.id === id || o.sourceId === id);
      if (found) handleSelectObject(found);
    },
    startNavigation: handleStartNavigation,
  }));

  // 计算附近精选列表
  const nearbyList = useMemo(() => {
    return mapObjects.filter((o) => o.featured).slice(0, 5);
  }, [mapObjects]);

  return (
    <div className={`${styles.mapContainer} ${className || ""}`}>
      {/* 真实 OpenStreetMap Leaflet 底图渲染视口 */}
      <div ref={containerRef} className={styles.mapViewport} aria-label="六祖云游 Leaflet 真实地理底图" />

      {/* 顶部悬浮指令条 (Topbar) */}
      <header className={styles.topbar}>
        <div className={styles.brand} aria-label="六祖云游">
          <div className={styles.brandMark}>六</div>
          <div className={styles.brandCopy}>
            <strong>六祖云游</strong>
            <small>地图就是主界面</small>
          </div>
        </div>

        {/* 智能搜索 */}
        <div className={styles.searchShell}>
          <label className={styles.searchBar}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              id={searchInputId}
              className={styles.searchInput}
              placeholder="找地点、人物或荔枝禅茶资源"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              autoComplete="off"
            />
            <kbd className={styles.searchKbd}>/</kbd>
          </label>

          {/* 搜索下拉结果 */}
          {searchOpen && (
            <section className={`${styles.searchPanel} ${styles.searchPanelOpen}`} aria-label="搜索结果">
              {searchResults.length === 0 ? (
                <div style={{ padding: "14px", textAlign: "center", color: "#66766f", fontSize: "13px" }}>
                  {searchQuery ? "未找到匹配项，试试“国恩寺”或“荔枝”" : "输入关键词即刻全图搜索"}
                </div>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.searchResultItem}
                    onClick={() => {
                      handleSelectObject(item);
                      setSearchOpen(false);
                    }}
                  >
                    <div className={styles.resultShape}>
                      <span>{item.shortLabel}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <strong style={{ fontSize: "14px", display: "block" }}>{item.title}</strong>
                      <small style={{ color: "#66766f" }}>{item.subtitle || item.description.slice(0, 24)}</small>
                    </div>
                    <CaretRight size={14} color="#66766f" />
                  </button>
                ))
              )}
            </section>
          )}
        </div>

        {/* 真实 GPS 定位按钮 */}
        <button
          type="button"
          className={styles.roundBtn}
          onClick={handleLocate}
          title="定位到我的当前位置"
          aria-label="定位"
        >
          <Compass size={22} weight={isLocating ? "bold" : "duotone"} />
        </button>
      </header>

      {/* 分类胶囊筛选栏 (Filter Bar) */}
      <nav className={styles.filterBar} aria-label="地图对象分类筛选">
        <button
          type="button"
          className={`${styles.filterChip} ${activeFilter === "featured" ? styles.filterChipActive : ""}`}
          onClick={() => setActiveFilter("featured")}
        >
          精选
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${activeFilter === "npc" ? styles.filterChipActive : ""}`}
          onClick={() => setActiveFilter("npc")}
        >
          <span className={`${styles.chipShape} ${styles.chipShapeCircle}`} />
          人物
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${activeFilter === "merchant" ? styles.filterChipActive : ""}`}
          onClick={() => setActiveFilter("merchant")}
        >
          <span className={`${styles.chipShape} ${styles.chipShapeSquare}`} />
          资源
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${activeFilter === "scenic_spot" ? styles.filterChipActive : ""}`}
          onClick={() => setActiveFilter("scenic_spot")}
        >
          <span className={`${styles.chipShape} ${styles.chipShapeDiamond}`} />
          地点
        </button>
      </nav>

      {/* 左下角几何图例 (Legend) */}
      <aside className={styles.legend} aria-label="地图图例">
        <div className={styles.legendRow}>
          <i className={`${styles.legendShape} ${styles.legendPerson}`} />
          <span>圆形：NPC / 向导</span>
        </div>
        <div className={styles.legendRow}>
          <i className={`${styles.legendShape} ${styles.legendResource}`} />
          <span>方形：文旅资源</span>
        </div>
        <div className={styles.legendRow}>
          <i className={`${styles.legendShape} ${styles.legendPlace}`} />
          <span>菱形：胜境地点</span>
        </div>
      </aside>

      {/* 底部附近精选抽屉按钮 */}
      {!activeRoute && (
        <button
          type="button"
          className={styles.nearbyBtn}
          onClick={() => setNearbyOpen(!nearbyOpen)}
        >
          <span>附近精选 · {nearbyList.length}</span>
        </button>
      )}

      {/* 附近精选弹出面板 */}
      {nearbyOpen && (
        <div
          style={{
            position: "absolute",
            zIndex: 520,
            left: "50%",
            bottom: "74px",
            transform: "translateX(-50%)",
            width: "min(520px, calc(100vw - 28px))",
            padding: "16px",
            borderRadius: "20px",
            background: "rgba(248, 245, 235, 0.98)",
            boxShadow: "var(--concept-shadow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", alignItems: "center" }}>
            <strong style={{ fontSize: "15px", color: "var(--concept-ink)" }}>六祖镇精选文旅对象</strong>
            <button
              type="button"
              onClick={() => setNearbyOpen(false)}
              style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: "18px" }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
            {nearbyList.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  handleSelectObject(item);
                  setNearbyOpen(false);
                }}
                style={{
                  padding: "10px",
                  borderRadius: "12px",
                  border: "1px solid var(--concept-line)",
                  background: "white",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <strong style={{ fontSize: "13px", display: "block", color: "var(--concept-ink)" }}>{item.title}</strong>
                <small style={{ color: "#66766f", fontSize: "11px" }}>{item.subtitle || item.source}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 浮动点位行动详情卡 (POIDetailCard) */}
      {selectedObject && (() => {
        const spotImg = selectedObject.sourceId ? getScenicSpotImage(selectedObject.sourceId as ScenicSpotId) : null;
        const imgSrc = selectedObject.imageUrl || spotImg?.asset.src || (selectedObject.type === "npc" ? LIUZU_BRAND_ASSETS.lockup.src : null);
        const distanceText = userLocation
          ? `约 ${Math.round(
              Math.sqrt(
                Math.pow((selectedObject.coordinates[0] - userLocation.coords[0]) * 111000, 2) +
                Math.pow((selectedObject.coordinates[1] - userLocation.coords[1]) * 102000, 2)
              ) / 10
            ) * 10} 米`
          : "";

        return (
          <section className={`${styles.detailPanel} ${styles.detailPanelOpen}`} aria-live="polite">
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => handleSelectObject(null)}
              aria-label="关闭详情"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              className={`${styles.saveBtn} ${savedIds.has(selectedObject.id) ? styles.saveBtnActive : ""}`}
              onClick={() => handleToggleSave(selectedObject.id, selectedObject.title)}
              aria-label="收藏"
            >
              <Star size={17} weight={savedIds.has(selectedObject.id) ? "fill" : "regular"} />
            </button>

            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginTop: "4px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.detailEyebrow}>
                  {selectedObject.subtitle || "六祖文旅对象"} · {selectedObject.verification}
                  {distanceText ? ` · ${distanceText}` : ""}
                </div>
                <h2 className={styles.detailTitle}>{selectedObject.title}</h2>
              </div>
              {imgSrc ? (
                <div style={{ width: "52px", height: "52px", borderRadius: "14px", overflow: "hidden", position: "relative", flexShrink: 0, border: "2px solid #ffffff", boxShadow: "0 4px 14px rgba(14,51,40,0.18)" }}>
                  <Image src={imgSrc} alt={selectedObject.title} fill className="object-cover" />
                </div>
              ) : null}
            </div>

            <p className={styles.detailDesc}>{selectedObject.description}</p>

            <div className={styles.detailMeta}>
              {selectedObject.tags.map((tag) => (
                <span key={tag} className={styles.detailTag}>
                  {tag}
                </span>
              ))}
            </div>

            <div className={styles.actionGrid}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => handleStartNavigation(selectedObject)}
              >
                <NavigationArrow size={15} weight="duotone" />
                <span>高德真实导航</span>
              </button>

              {selectedObject.linkUrl ? (
                <Link href={selectedObject.linkUrl} className={styles.btnPrimary}>
                  <span>深度探索</span>
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <a
                  href={selectedObject.action === "community" ? `/community` : `/explore`}
                  className={styles.btnPrimary}
                >
                  <span>{selectedObject.action === "community" ? "地点社区" : "发现更多"}</span>
                  <ArrowRight size={15} />
                </a>
              )}
            </div>
          </section>
        );
      })()}

      {/* 真实高德导航路线卡片 (Route Card) */}
      {activeRoute && (
        <section className={`${styles.routeCard} ${styles.routeCardOpen}`} aria-label="高德导航路线预览">
          <div className={styles.routeHead}>
            <div className={styles.routeStepIcon}>↑</div>
            <div className={styles.routeCopy}>
              <strong>前往【{activeRoute.targetTitle}】</strong>
              <small>
                {activeRoute.distanceText} · {activeRoute.durationText} · 高德精确规划
              </small>
            </div>
          </div>

          <div style={{ marginTop: "10px", padding: "8px 10px", borderRadius: "10px", background: "white", fontSize: "12px", color: "#174a3a" }}>
            <strong>导航指引：</strong>
            <p style={{ margin: "4px 0 0", color: "#66766f" }}>{activeRoute.steps[0]?.instruction || "沿推荐路线行进"}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "12px" }}>
            <a
              href={activeRoute.amapAppUrl}
              className={styles.btnPrimary}
              style={{ fontSize: "12px", padding: "0 6px" }}
              title="唤起高德地图手机 App"
            >
              <span>App 导航</span>
              <ArrowUpRight size={13} />
            </a>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleLocate}
              style={{ fontSize: "12px" }}
            >
              <span>回到我</span>
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleCancelRoute}
              style={{ fontSize: "12px" }}
            >
              <span>结束导航</span>
            </button>
          </div>
        </section>
      )}

      {/* Toast 提示 */}
      {toastMessage && (
        <div
          style={{
            position: "absolute",
            zIndex: 999,
            left: "50%",
            bottom: "26px",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            borderRadius: "12px",
            color: "white",
            background: "#0e3328",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
});
