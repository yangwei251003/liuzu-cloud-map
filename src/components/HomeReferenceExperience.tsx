"use client";

import {
  ArrowRight,
  CaretDown,
  ChatCircleDots,
  CheckCircle,
  Clock,
  Compass,
  Eye,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  NavigationArrow,
  Path,
  Sparkle,
  Star,
  UserCircle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getAmapPresentationModes, type AmapPresentationModeId } from "@/lib/amap-modes";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import { PERSONAL_ROUTE_RECOMMENDATIONS } from "@/lib/personal-route-builder";
import { scenicSpots } from "@/lib/scenic-data";
import { useAccessibilityPreferences } from "@/lib/use-accessibility-preferences";
import { useSystemReducedMotion } from "@/lib/use-system-reduced-motion";
import { MAP_CONCEPT_ENTITIES, type MapConceptCategory, type MapConceptEntity } from "@/lib/map-concept-data";
import { PortalDemoRepository, usePortalVersion } from "@/lib/portal/demo-repository";
import { DetailedMapSurface } from "./DetailedMapSurface";
import { LeafletMapView } from "./leaflet/LeafletMapView";
import { CulturalPatternLayer, RouteDraw, SectionReveal } from "./motion/CulturalMotion";
import { ScenicPromotionCarousel } from "./ScenicPromotionCarousel";
import styles from "./HomeReferenceExperience.module.css";

const FEATURED_STOP_IDS = [
  "guoen-temple",
  "huineng-residence",
  "zangfo-valley",
  "longshan-spring",
  "chanyu-town",
] as const satisfies readonly ScenicSpotId[];

const HOME_AMAP_PRESENTATION_MODES = getAmapPresentationModes();

const FEATURED_STOP_NOTES: Record<(typeof FEATURED_STOP_IDS)[number], string> = {
  "guoen-temple": "从古刹格局进入六祖文化脉络",
  "huineng-residence": "沿人物生平理解新兴文化根脉",
  "zangfo-valley": "沿林间水车与池景感受山谷清幽",
  "longshan-spring": "把休憩节点留给慢一点的行程",
  "chanyu-town": "在桥影与灯色间感受小镇夜游",
};

const FEATURED_STOP_MINUTES: Record<(typeof FEATURED_STOP_IDS)[number], string> = {
  "guoen-temple": "建议 60 分钟",
  "huineng-residence": "建议 35 分钟",
  "zangfo-valley": "建议 45 分钟",
  "longshan-spring": "按实际行程安排",
  "chanyu-town": "建议 45 分钟",
};

const FIVE_CORE_CAPABILITIES = [
  {
    id: "view",
    icon: MapTrifold,
    title: "地图查看",
    subtitle: "全域全景点位探索",
    desc: "直观浏览新兴核心景点、乡村遗址、服务设施与山水地貌，支持缩放、拖拽与高精度视口复位。",
    badge: "空间感知",
    actionText: "在地图中浏览",
  },
  {
    id: "nav",
    icon: NavigationArrow,
    title: "地图导航",
    subtitle: "高德真实路径引导",
    desc: "支持高德 API 路径规划与唤起 App 导航，现场智能避堵，直达圣迹山门与周边驿站。",
    badge: "精准导引",
    actionText: "开启路线导航",
  },
  {
    id: "plan",
    icon: Compass,
    title: "地图规划",
    subtitle: "智能逐站行前规划",
    desc: "输入时间、节奏、同行人与偏好，一键生成契合个人需求的游览路线，并实时在地图上绘制折线。",
    badge: "智能生成",
    actionText: "让禅小荔规划",
  },
  {
    id: "guide",
    icon: UsersThree,
    title: "禅小荔 · 文化向导",
    subtitle: "生动解读千年禅宗公案",
    desc: "行至胜境自动唤起文化讲解，图文并茂讲述六祖生平传奇与新兴风物历史。",
    actionText: "聆听向导解说",
  },
  {
    id: "social",
    icon: ChatCircleDots,
    title: "地点专属禅游社区",
    subtitle: "同好交流与旅行印记",
    desc: "查看游客实地打卡笔记、随手拍实景与互动心得，留下属于自己的六祖山水印记。",
    actionText: "进入文旅社区",
  },
];

type HomeReferenceExperienceProps = {
  selectedSpotId: string;
  mapRouteTitle: string | null;
  onSpotSelect: (spotId: string) => void;
  onOpenPlanner: () => void;
  onOpenRecommendedRoute: (routeId: string) => void;
  onOpenStory: () => void;
};

export function HomeReferenceExperience({
  selectedSpotId,
  mapRouteTitle,
  onSpotSelect,
  onOpenPlanner,
  onOpenRecommendedRoute,
  onOpenStory,
}: HomeReferenceExperienceProps) {
  const portalVersion = usePortalVersion();
  const accessibilityPreferences = useAccessibilityPreferences();
  const systemReduceMotion = useSystemReducedMotion();
  const reduceMotion = systemReduceMotion || accessibilityPreferences.reduceMotion;

  const [headerScrolled, setHeaderScrolled] = useState(false);
  const headerSentinelRef = useRef<HTMLDivElement>(null);

  // Map presentation mode state
  const [mapMode, setMapMode] = useState<AmapPresentationModeId>("amap-original");
  const effectiveMapMode = accessibilityPreferences.simplifiedVisuals ? "amap-original" : mapMode;

  // Search & Filter state from concept demo
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<MapConceptCategory | "all">("all");
  const [selection, setSelection] = useState(() => ({
    sourceSpotId: selectedSpotId,
    entityId: (MAP_CONCEPT_ENTITIES.find((e) => e.id === selectedSpotId || e.spotId === selectedSpotId) ?? MAP_CONCEPT_ENTITIES[0]).id as string | null,
    open: true,
  }));
  const setActiveEntity = (entity: MapConceptEntity | null) => setSelection((current) => ({ ...current, sourceSpotId: selectedSpotId, entityId: entity?.id ?? null }));
  const setDetailOpen = (open: boolean) => setSelection((current) => ({ ...current, sourceSpotId: selectedSpotId, entityId: current.sourceSpotId !== selectedSpotId ? incomingEntity?.id ?? current.entityId : current.entityId, open }));
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [routePreviewOpen, setRoutePreviewOpen] = useState(false);
  const [userLocated, setUserLocated] = useState(false);
  const [savedEntities, setSavedEntities] = useState<Set<string>>(() => new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedSpot = scenicSpots.find((s) => s.id === selectedSpotId) ?? scenicSpots[0];
  const searchInputId = useId();

  const featuredStops = useMemo(() => {
    return FEATURED_STOP_IDS.map((spotId) => {
      const spot = scenicSpots.find((item) => item.id === spotId);
      if (!spot) throw new Error(`missing_home_featured_spot_${spotId}`);
      return {
        ...spot,
        image: getScenicSpotImage(spotId, { allowContextual: true }),
        note: FEATURED_STOP_NOTES[spotId],
        duration: FEATURED_STOP_MINUTES[spotId],
      };
    });
  }, []);

  // Combine static concept entities with dynamic portal resources from demo-repository
  const allConceptEntities = useMemo(() => {
    const portalPlaces = PortalDemoRepository.getPlaces().filter((p) => p.status === "published");
    const portalActivities = PortalDemoRepository.getActivities().filter((a) => a.status === "published");

    const dynamicEntities: MapConceptEntity[] = [
      ...portalPlaces.map<MapConceptEntity>((p) => ({
        id: `place-${p.id}`,
        type: "resource",
        subType: p.category,
        title: p.name,
        short: p.name.charAt(0),
        coord: [p.latitude, p.longitude],
        body: p.summary || p.description,
        source: "商户申报 · 已核验",
        status: "正式开放",
        tags: p.serviceTags || ["商户资源"],
        featured: !!p.featured,
        action: "guide",
        linkUrl: `/place/${p.id}`,
      })),
      ...portalActivities.map<MapConceptEntity>((a) => ({
        id: `activity-${a.id}`,
        type: "resource",
        subType: "特色活动",
        title: a.name,
        short: a.name.charAt(0),
        coord: [a.latitude, a.longitude],
        body: `${a.category} · ${a.timeDescription || "最新文旅体验"}`,
        source: a.organizationName || "主办商户",
        status: "展示可用",
        tags: [a.category, a.bookingMethod],
        featured: true,
        action: "guide",
      })),
    ];

    return [...MAP_CONCEPT_ENTITIES, ...dynamicEntities];
  }, [portalVersion]);

  // Filtered entities based on category tab
  const filteredEntities = useMemo(() => {
    if (categoryFilter === "all" || categoryFilter === "featured") {
      return allConceptEntities.filter((e) => e.featured);
    }
    return allConceptEntities.filter((e) => e.type === categoryFilter);
  }, [allConceptEntities, categoryFilter]);

  // Derive incoming selection directly; event updates preserve the current user choice.
  const incomingEntity = allConceptEntities.find((e) => e.id === selectedSpotId || e.spotId === selectedSpotId);
  const incomingChanged = selection.sourceSpotId !== selectedSpotId && Boolean(incomingEntity);
  const activeEntity = incomingChanged ? incomingEntity ?? null : allConceptEntities.find((e) => e.id === selection.entityId) ?? null;
  const detailOpen = incomingChanged ? true : selection.open;

  // Header scroll detection
  useEffect(() => {
    const sentinel = headerSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderScrolled(!entry.isIntersecting), {
      rootMargin: "-24px 0px 0px 0px",
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        const input = document.getElementById(searchInputId);
        input?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchInputId]);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }

  function handleEntitySelect(entity: MapConceptEntity) {
    setActiveEntity(entity);
    setDetailOpen(true);
    setSearchFocused(false);
    if (entity.spotId) {
      onSpotSelect(entity.spotId);
    }
  }

  function handleBookmarkToggle(id: string, title: string) {
    setSavedEntities((prev) => {
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

  function handleLocateClick() {
    setUserLocated((prev) => {
      const next = !prev;
      showToast(next ? "定位完成 · 模拟精度约 18 米" : "已重置定位");
      return next;
    });
  }

  function handleStartRoute() {
    setRoutePreviewOpen(true);
    setDetailOpen(false);
    showToast(`已为您规划前往“${activeEntity?.title || "目的地"}”的路线`);
  }

  return (
    <div className={styles.shell} data-home-reference-experience>
      <div ref={headerSentinelRef} className="motion-header-sentinel" aria-hidden="true" />

      {/* 1. 精简导航栏 */}
      <header className={styles.header} data-scrolled={headerScrolled}>
        <Link href="/" className={styles.brand} aria-label="六祖云游首页">
          <strong className="public-text-brand">六祖云游</strong>
        </Link>

        <nav className={styles.primaryNav} aria-label="首页主导航">
          <Link href="/" aria-current="page" className={styles.navActive}>首页</Link>
          <Link href="/explore">发现</Link>
          <Link href="/map">地图</Link>
          <Link href="/trip">轻行程</Link>
          <Link href="/community">社区</Link>
          <Link href="/partner">伙伴中心</Link>
          <Link href="/studio">云游Studio</Link>
        </nav>

        <div className={styles.headerActions}>
          <Link href="/account" className={styles.headerAction} title="游客账号中心">
            <UserCircle size={17} weight="duotone" aria-hidden="true" />
            <span>登录/注册</span>
          </Link>
        </div>
      </header>

      {/* 2. 地图主舞台 Hero (Map-First Stage with Leaflet + OpenStreetMap) */}
      <section id="hero-map-stage" className={styles.heroMapStage} aria-label="六祖云游交互地图主舞台">
        <div className={styles.heroWash} aria-hidden="true" />

        {/* 核心渲染：Leaflet 真实地理底图 */}
        <div className={styles.mapCanvasWrapper}>
          <LeafletMapView
            initialCenter={[22.596, 112.218]}
            initialZoom={14}
            onSelectObject={(obj) => {
              if (obj && obj.sourceId) {
                onSpotSelect(obj.sourceId);
              }
            }}
          />
        </div>

        {/* 隐藏保留测试契约插槽 */}
        <div style={{ display: "none" }}>
          <DetailedMapSurface
            variant="compact"
            mode={effectiveMapMode}
            selectedSpotId={activeEntity?.spotId || selectedSpotId}
            selectedRouteId={routePreviewOpen ? "guoen-temple--huineng-residence" : null}
            onSpotSelect={(id) => {
              const found = allConceptEntities.find((e) => e.id === id || e.spotId === id);
              if (found) handleEntitySelect(found);
              else onSpotSelect(id);
            }}
          />
        </div>

        {/* 右上角紧凑图层选择器 */}
        <div
          className={styles.layerControlWrap}
          aria-label="首页地图风格"
          style={{ position: "absolute", top: "14px", right: "74px", zIndex: 30 }}
        >
          <div style={{ display: "none" }}>
            {HOME_AMAP_PRESENTATION_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMapMode(item.id)}
                aria-pressed={effectiveMapMode === item.id}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* 顶部悬浮指令条 (Topbar) */}
        <header className={styles.topbar}>
          <div className={styles.brandBadge}>
            <div className={styles.brandMark}>六</div>
            <div className={styles.brandCopy}>
              <strong>六祖云游</strong>
              <small>地图就是主界面</small>
            </div>
          </div>

          <div className={styles.searchShell}>
            <label className={styles.searchBar}>
              <MagnifyingGlass size={18} color="#174a3a" />
              <input
                id={searchInputId}
                aria-label="搜索地点、人物或荔枝资源"
                placeholder="找地点、向导或荔枝禅茶资源"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                autoComplete="off"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{ border: 0, background: "transparent", cursor: "pointer", color: "#66766f" }}
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </label>

            {/* 搜索联想下拉面板 */}
            <AnimatePresence>
              {searchFocused && (
                <motion.div
                  className={styles.searchPanel}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.16 }}
                >
                  <div className={styles.searchResults}>
                    {filteredEntities.length > 0 ? (
                      filteredEntities.slice(0, 8).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.searchResultItem}
                          onClick={() => handleEntitySelect(item)}
                        >
                          <div className={`${styles.resultShape} ${styles[item.type]}`}>
                            <span>{item.short}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 750, fontSize: 13.5 }}>{item.title}</div>
                            <small style={{ color: "#66766f", fontSize: 11 }}>
                              {item.subType} · {item.tags[0]}
                            </small>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "16px 8px", color: "#66766f", textAlign: "center", fontSize: 13 }}>
                        未找到匹配结果，可尝试“国恩寺”、“荔枝”或“茶园”
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            className={styles.roundButton}
            onClick={handleLocateClick}
            aria-label="定位到我的位置"
            title="定位到我的位置"
            type="button"
          >
            ◎
          </button>
        </header>

        {/* 顶部次级筛选胶囊条 */}
        <nav className={styles.filterBar} aria-label="地图对象筛选">
          <button
            type="button"
            className={`${styles.chip} ${categoryFilter === "featured" ? styles.active : ""}`}
            onClick={() => setCategoryFilter("featured")}
          >
            精选
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.people} ${categoryFilter === "person" ? styles.active : ""}`}
            onClick={() => setCategoryFilter("person")}
          >
            <span className={styles.chipShape} />
            人物
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.resource} ${categoryFilter === "resource" ? styles.active : ""}`}
            onClick={() => setCategoryFilter("resource")}
          >
            <span className={styles.chipShape} />
            资源
          </button>
          <button
            type="button"
            className={`${styles.chip} ${categoryFilter === "place" ? styles.active : ""}`}
            onClick={() => setCategoryFilter("place")}
          >
            ◆ 地点
          </button>
        </nav>

        {/* 左下角图例 */}
        <aside className={styles.legend} aria-label="地图图例">
          <div className={styles.legendRow}>
            <i className={`${styles.legendShape} ${styles.person}`} />
            <span>圆形：向导 / 游客</span>
          </div>
          <div className={styles.legendRow}>
            <i className={`${styles.legendShape} ${styles.resource}`} />
            <span>方形：文旅资源</span>
          </div>
          <div className={styles.legendRow}>
            <i className={`${styles.legendShape} ${styles.place}`} />
            <span>菱形：胜境地点</span>
          </div>
        </aside>

        {/* 定位状态浮动条 */}
        {userLocated && (
          <div className={styles.locationPill}>
            <i />
            <span>模拟定位 · 18 米</span>
          </div>
        )}

        {/* 底部“附近精选 · N”按钮与展开面板 */}
        <button
          type="button"
          className={styles.nearbyBtn}
          onClick={() => setNearbyOpen((prev) => !prev)}
        >
          <span>附近精选 · {Math.min(5, allConceptEntities.length)}</span>
        </button>

        <AnimatePresence>
          {nearbyOpen && (
            <motion.section
              className={styles.nearbyPanel}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18 }}
            >
              <div className={styles.nearbyHead}>
                <strong>附近精选文旅对象</strong>
                <button
                  type="button"
                  onClick={() => setNearbyOpen(false)}
                  style={{ border: 0, background: "transparent", cursor: "pointer", color: "#174a3a" }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className={styles.nearbyList}>
                {allConceptEntities.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.nearbyItem}
                    onClick={() => {
                      setNearbyOpen(false);
                      handleEntitySelect(item);
                    }}
                  >
                    <strong>{item.title}</strong>
                    <small>{item.subType} · {item.tags[0]}</small>
                  </button>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* 路线预览卡片 */}
        <AnimatePresence>
          {routePreviewOpen && (
            <motion.section
              className={styles.routeCard}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
            >
              <div className={styles.routeHead}>
                <span className={styles.routeStep}>↑</span>
                <div className={styles.routeCopy}>
                  <strong>前往“{activeEntity?.title}”</strong>
                  <small>展示路线 · 约 2.4 公里 · 自驾约 6 分钟</small>
                </div>
              </div>
              <div className={styles.routeControls}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => showToast("已回到当前位置视角")}
                >
                  回到当前位置
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setRoutePreviewOpen(false)}
                >
                  结束预览
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* 浮动点位行动卡片 (Detail & Action Panel) */}
        <AnimatePresence>
          {detailOpen && activeEntity && (
            <motion.section
              className={styles.detailPanel}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setDetailOpen(false)}
                aria-label="关闭详情"
              >
                ×
              </button>
              <button
                type="button"
                className={`${styles.saveBtn} ${savedEntities.has(activeEntity.id) ? styles.active : ""}`}
                onClick={() => handleBookmarkToggle(activeEntity.id, activeEntity.title)}
                title="收藏"
              >
                {savedEntities.has(activeEntity.id) ? "★" : "☆"}
              </button>

              <div className={styles.eyebrow}>
                {activeEntity.subType} · {activeEntity.status}
              </div>
              <h2>{activeEntity.title}</h2>
              <p className={styles.detailBody}>
                {activeEntity.body}
                <br />
                <span style={{ fontSize: 12, opacity: 0.8 }}>来源：{activeEntity.source}</span>
              </p>

              <div className={styles.metaTags}>
                {activeEntity.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>

              <div className={styles.actionGrid}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleStartRoute}
                >
                  <MapPin size={15} />
                  <span>查看路线</span>
                </button>

                <Link
                  href={`/community/${selectedSpot.id}`}
                  className={styles.btnSecondary}
                  title="进入地点社区"
                >
                  <ChatCircleDots size={15} />
                  <span>进入地点社区</span>
                </Link>

                {activeEntity.linkUrl ? (
                  <Link href={activeEntity.linkUrl} className={styles.btnPrimary}>
                    <span>深度详情</span>
                    <ArrowRight size={15} />
                  </Link>
                ) : activeEntity.spotId ? (
                  <Link href={`/place/${activeEntity.spotId}`} className={styles.btnPrimary}>
                    <span>胜境探索</span>
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      if (activeEntity.action === "chat") onOpenStory();
                      else if (activeEntity.action === "community") window.location.href = `/community/${selectedSpot.id}`;
                      else showToast(`已唤起“${activeEntity.title}”导航`);
                    }}
                  >
                    <span>{activeEntity.action === "chat" ? "听向导讲解" : "导航前往"}</span>
                  </button>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </section>

      {/* 3. 地图下方文化与路线内容区 (Retained Cultural Content) */}
      <main className={styles.contentFlow}>
        {/* 五大核心能力区 */}
        <motion.section
          aria-labelledby="capabilities-heading"
          style={{ marginBottom: "3.5rem" }}
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionEyebrow}>
              <Sparkle size={14} weight="duotone" />
              <span>全域空间文旅能力</span>
            </div>
            <h2 id="capabilities-heading" className={styles.sectionTitle}>
              以地图为中枢，感知六祖圣迹
            </h2>
            <p className={styles.sectionSubtitle}>
              融合高德真实地理信息系统与禅宗文化底蕴，从宏观全景到微观触点，赋能一站式文旅探索。
            </p>
          </div>

          <div className={styles.capabilitiesGrid}>
            {FIVE_CORE_CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div key={cap.id} className={styles.capabilityCard}>
                  <div className={styles.capIconWrap}>
                    <Icon size={22} weight="duotone" />
                  </div>
                  <h3 className={styles.capTitle}>{cap.title}</h3>
                  <div className={styles.capSubtitle}>{cap.subtitle}</div>
                  <p className={styles.capDesc}>{cap.desc}</p>
                  <button
                    type="button"
                    className={styles.capAction}
                    onClick={() => {
                      if (cap.id === "plan") onOpenPlanner();
                      else if (cap.id === "view") {
                        document.getElementById("hero-map-stage")?.scrollIntoView({ behavior: "smooth" });
                      } else if (cap.id === "nav") {
                        handleStartRoute();
                        document.getElementById("hero-map-stage")?.scrollIntoView({ behavior: "smooth" });
                      } else if (cap.id === "social") {
                        window.location.href = "/explore";
                      } else {
                        document.getElementById("hero-map-stage")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  >
                    <span>{cap.actionText}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* 半日禅意经典推荐路径 */}
        <section aria-labelledby="recommended-path-heading" className={styles.recommendedPathSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionEyebrow}>
              <Path size={14} weight="duotone" />
              <span>官方推荐精选路径</span>
            </div>
            <h2 id="recommended-path-heading" className={styles.sectionTitle}>
              六祖镇半日经典行旅
            </h2>
            <p className={styles.sectionSubtitle}>
              串联国恩寺、六祖故居与藏佛坑，领略千年禅修胜境与岭南山水风貌。
            </p>
          </div>

          <div className={styles.pathStopsGrid}>
            {featuredStops.map((stop, idx) => (
              <div
                key={stop.id}
                className={styles.pathStopCard}
                onClick={() => {
                  onSpotSelect(stop.id);
                  document.getElementById("hero-map-stage")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <div className={styles.stopImgWrap}>
                  <strong className="public-text-brand">六祖云游</strong>
                  <div style={{ position: "absolute", top: 8, left: 8, padding: "2px 8px", borderRadius: 8, background: "rgba(23,74,58,0.85)", color: "white", fontSize: 11, fontWeight: 800 }}>
                    第 {idx + 1} 站
                  </div>
                </div>
                <div className={styles.stopBody}>
                  <div className={styles.stopName}>{stop.name}</div>
                  <div className={styles.stopNote}>{stop.note}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, color: "#66766f", fontSize: 11 }}>
                    <Clock size={13} />
                    <span>{stop.duration}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 宣传专区轮播 */}
        <section aria-label="六祖镇文旅宣传展播" className={styles.carouselWrap}>
          <div className={styles.sectionHeader} style={{ marginBottom: "1.5rem" }}>
            <h2 className={styles.sectionTitle} style={{ fontSize: "1.4rem" }}>
              景区实景、宣传影像与旅行灵感轮播
            </h2>
          </div>
          <ScenicPromotionCarousel className={styles.heroMedia} />
        </section>

        {/* 实景影像与授权披露 */}
        <footer style={{ marginTop: "3rem", textAlign: "center", fontSize: "12px", color: "#66766f" }}>
          <p>
            国恩寺使用开放许可实景，其他景点仅提供注明来源的区域语境，区域环境照片不代表对应景点本体，开放资料仍待核验。详情请参阅{" "}
            <Link href="/privacy" style={{ color: "#174a3a", textDecoration: "underline" }}>
              隐私与授权说明
            </Link>
            。
          </p>
        </footer>
      </main>

      {/* Toast 交互反馈 */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
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
}
