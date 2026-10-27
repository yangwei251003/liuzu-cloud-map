"use client";

import {
  ArrowRight,
  Clock,
  Compass,
  Path,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { getAmapPresentationModes, type AmapPresentationModeId } from "@/lib/amap-modes";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import { PERSONAL_ROUTE_RECOMMENDATIONS } from "@/lib/personal-route-builder";
import { scenicSpots } from "@/lib/scenic-data";
import { useAccessibilityPreferences } from "@/lib/use-accessibility-preferences";
import { useSystemReducedMotion } from "@/lib/use-system-reduced-motion";
import { DetailedMapSurface } from "./DetailedMapSurface";
import { CulturalPatternLayer, CulturalTextReveal, RouteDraw, SectionReveal } from "./motion/CulturalMotion";
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

type HomeReferenceExperienceProps = {
  selectedSpotId: string;
  mapRouteTitle: string | null;
  onSpotSelect: (spotId: string) => void;
  onOpenPlanner: () => void;
  onOpenRecommendedRoute: (routeId: string) => void;
  onOpenStory: () => void;
};

function PointerResponsiveFrame({
  children,
  className,
  motionDisabled = false,
}: {
  children: ReactNode;
  className: string;
  motionDisabled?: boolean;
}) {
  const systemReduceMotion = useSystemReducedMotion();
  const reduceMotion = motionDisabled || systemReduceMotion;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [1.8, -1.8]), {
    stiffness: 190,
    damping: 28,
    mass: 0.35,
  });
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-2.2, 2.2]), {
    stiffness: 190,
    damping: 28,
    mass: 0.35,
  });

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      {children}
    </motion.div>
  );
}

export function HomeReferenceExperience({
  selectedSpotId,
  mapRouteTitle,
  onSpotSelect,
  onOpenPlanner,
  onOpenRecommendedRoute,
  onOpenStory,
}: HomeReferenceExperienceProps) {
  const accessibilityPreferences = useAccessibilityPreferences();
  const systemReduceMotion = useSystemReducedMotion();
  const reduceMotion = systemReduceMotion;
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const headerSentinelRef = useRef<HTMLDivElement>(null);
  const [mapMode, setMapMode] = useState<AmapPresentationModeId>("amap-original");
  const effectiveMapMode = accessibilityPreferences.simplifiedVisuals ? "amap-original" : mapMode;
  const selectedSpot = scenicSpots.find((spot) => spot.id === selectedSpotId) ?? scenicSpots[0];
  const selectedSpotImage = getScenicSpotImage(selectedSpot.id as ScenicSpotId, { allowContextual: true });
  const featuredStops = FEATURED_STOP_IDS.map((spotId) => {
    const spot = scenicSpots.find((item) => item.id === spotId);
    if (!spot) throw new Error(`missing_home_featured_spot_${spotId}`);
    return {
      ...spot,
      image: getScenicSpotImage(spotId, { allowContextual: true }),
      note: FEATURED_STOP_NOTES[spotId],
      duration: FEATURED_STOP_MINUTES[spotId],
    };
  });

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

  return (
    <div className={styles.shell} data-home-reference-experience>
      <div ref={headerSentinelRef} className="motion-header-sentinel" aria-hidden="true" />
      <header className={styles.header} data-scrolled={headerScrolled}>
        <Link href="/" className={styles.brand} aria-label="六祖云游首页">
          <strong className="public-text-brand">六祖云游</strong>
        </Link>

        <nav className={styles.primaryNav} aria-label="首页主导航">
          <Link href="/" aria-current="page">首页</Link>
          <Link href="/plan">行程</Link>
          <Link href="/map">地图</Link>
          <Link href="/community">社区</Link>
          <Link href="/journey">我的</Link>
        </nav>

        <div className={styles.headerActions}>
          <Link href="/arrival" className={styles.headerAction}>
            <Compass size={19} weight="duotone" aria-hidden="true" />
            <span>新兴导览</span>
          </Link>
          <Link href="/account" className={styles.headerAction}>
            <UserCircle size={20} weight="duotone" aria-hidden="true" />
            <span>登录/注册</span>
          </Link>
        </div>
      </header>

      <div className={styles.canvas}>
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
          className={styles.heroCopy}
          aria-labelledby="home-hero-title"
        >
          <CulturalPatternLayer className={styles.heroCulturePattern} />
          <RouteDraw className={styles.heroRouteDraw} />
          <Image
            src="/assets/images/liuzu-journey-hero-ai-v1.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 32vw, 100vw"
            className={styles.heroWash}
            aria-hidden="true"
            priority
          />
          <div className={styles.heroCopyInner}>
            <h1 id="home-hero-title" className={styles.heroTitle}>
              <CulturalTextReveal className={styles.heroTitleLead} reducedMotion={reduceMotion} delay={0.06}>今天，</CulturalTextReveal>
              <CulturalTextReveal className={styles.heroTitleQuestion} reducedMotion={reduceMotion} delay={0.14}>想怎样遇见新兴？</CulturalTextReveal>
            </h1>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={styles.heroIntro}
            >不赶景点清单。让禅小荔读懂你的时间、同行人与兴趣，从真实空间出发，陪你走一条更有来处的文化之旅。</motion.p>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={styles.heroActions}
            >
              <button type="button" onClick={onOpenPlanner} className={styles.heroCta} aria-label="生成我的路线">
                <span>让禅小荔陪我规划</span>
                <ArrowRight size={21} weight="bold" aria-hidden="true" />
              </button>
              <Link href="/community" className={styles.communityCta}>
                <UsersThree size={20} weight="duotone" aria-hidden="true" />
                <span><strong>进入地点社区</strong><small>看分享，留足迹</small></span>
              </Link>
            </motion.div>
          </div>
        </motion.section>

        <motion.section
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985, x: 14 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.72, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className={styles.heroMediaCell}
          aria-label="新兴与六祖文化宣传专区"
          aria-description="景区实景、宣传影像与旅行灵感轮播。"
        >
          <PointerResponsiveFrame
            className={styles.heroMediaTilt}
            motionDisabled={accessibilityPreferences.simplifiedVisuals}
          >
            <ScenicPromotionCarousel className={styles.heroMedia} />
          </PointerResponsiveFrame>
        </motion.section>

        <SectionReveal
          reducedMotion={reduceMotion}
          amount={0.18}
          className={styles.routePanel}
          aria-labelledby="featured-route-title"
        >
          <div className={styles.routeHeading}>
            <div>
              <span className={styles.routeLeaf} aria-hidden="true">茶</span>
              <h2 id="featured-route-title">为你推荐 · 半日禅意路线</h2>
            </div>
            <button type="button" onClick={onOpenPlanner}>调整偏好</button>
          </div>

          <ol className={styles.stopList}>
            {featuredStops.map((stop, index) => {
              const selected = stop.id === selectedSpotId;
              return (
                <motion.li
                  key={stop.id}
                  className={styles.stopItem}
                  initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.34, delay: index * 0.045, ease: [0.16, 1, 0.3, 1] }}
                >
                  <button
                    type="button"
                    onClick={() => onSpotSelect(stop.id)}
                    aria-pressed={selected}
                    aria-label={`在地图中查看${stop.name}`}
                    className={styles.stopButton}
                    data-selected={selected}
                  >
                    <span className={styles.stopIndex} data-selected={selected}>{index + 1}</span>
                    <span className={styles.stopImage}>
                      {stop.image ? (
                        <Image
                          src={stop.image.asset.src}
                          alt={stop.image.asset.alt}
                          fill
                          sizes="190px"
                          className={styles.stopPhoto}
                          priority={index < 2}
                        />
                      ) : null}
                      <span className={styles.mediaRelation}>{stop.image?.relation === "EXACT_SPOT" ? "景点实景" : "区域实景"}</span>
                    </span>
                    <span className={styles.stopCopy}>
                      <strong>{stop.name}</strong>
                      <span>{stop.note}</span>
                      <small>{stop.duration}</small>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>

          <div className={styles.routeFooter}>
            <p className={styles.routeMediaDisclosure}>国恩寺使用开放许可实景，其他景点仅提供注明来源的区域语境，区域环境照片不代表对应景点本体，开放资料仍待核验。<Link href="/privacy">来源与说明</Link></p>
            <div className={styles.routeMeta} aria-label="路线概览">
              <span><Clock size={15} weight="duotone" aria-hidden="true" />约 3 小时</span>
              <span><Path size={15} weight="duotone" aria-hidden="true" />步行为主</span>
              <span><UsersThree size={15} weight="duotone" aria-hidden="true" />适合文化慢游</span>
            </div>
          </div>
        </SectionReveal>

        <motion.section
          id="map"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.99 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
          className={styles.mapPanel}
          aria-label="半日禅意路线地图"
          data-home-route-map
        >
          <div className={styles.mapModeBar}>
            <span>地图风格</span>
            <div className={styles.mapModeChoices} role="group" aria-label="首页地图风格">
              {HOME_AMAP_PRESENTATION_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setMapMode(mode.id)}
                  aria-pressed={effectiveMapMode === mode.id}
                  disabled={accessibilityPreferences.simplifiedVisuals && mode.id !== "amap-original"}
                  title={`${mode.shortDescription}。${mode.disclosure}`}
                >
                  {mode.name}
                </button>
              ))}
            </div>
            {accessibilityPreferences.simplifiedVisuals ? <small>辅助设置已锁定高德原图</small> : null}
          </div>
          <div className={styles.mapViewport}>
            <DetailedMapSurface
              variant="compact"
              mode={effectiveMapMode}
              selectedSpotId={selectedSpotId}
              selectedRouteId="guoen-temple--huineng-residence"
              onSpotSelect={onSpotSelect}
            />
            <div className={styles.mapSpotSummary}>
              {selectedSpotImage ? (
                <span className={styles.mapSpotPhoto}>
                  <Image src={selectedSpotImage.asset.src} alt="" fill sizes="64px" />
                </span>
              ) : null}
              <div className={styles.mapSpotCopy}>
                <span>正在查看</span>
                <strong>{selectedSpot.name}</strong>
                <div className={styles.mapSpotActions}>
                  <button type="button" onClick={onOpenStory}>听景点故事</button>
                  <Link href={`/community/${selectedSpot.id}`}>看游客摄影</Link>
                </div>
              </div>
            </div>
            <Link href="/map" className={styles.fullMapLink}>
              查看全图 <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <p className={styles.mapBoundary}>地图帮助你行前了解位置；到访时请结合现场标识与当天通行提示。</p>
            {mapRouteTitle ? (
              <div className={styles.generatedRouteStatus} role="status">
                <span><strong>正在查看“{mapRouteTitle}”</strong>：地图已聚焦第一站。</span>
                <span>未经现场复走</span>
              </div>
            ) : null}
          </div>
        </motion.section>

        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={styles.preferenceRail}
          aria-label="路线偏好快捷入口"
        >
          <div className={styles.preferenceIntro}>
            <span aria-hidden="true">导览</span>
            <p><strong>想调整时间或节奏？</strong><span>告诉禅小荔你的想法，路线会更贴合你。</span></p>
          </div>
          <div className={styles.preferenceChoices}>
            <button type="button" onClick={() => onOpenRecommendedRoute(PERSONAL_ROUTE_RECOMMENDATIONS[1].id)}>时间充裕，想慢慢走</button>
            <button type="button" onClick={() => onOpenRecommendedRoute(PERSONAL_ROUTE_RECOMMENDATIONS[1].id)}>带长辈出行，节奏放缓</button>
            <button type="button" onClick={() => onOpenRecommendedRoute(PERSONAL_ROUTE_RECOMMENDATIONS[0].id)}>偏爱人物与禅文化</button>
            <button type="button" onClick={() => onOpenRecommendedRoute(PERSONAL_ROUTE_RECOMMENDATIONS[2].id)}>亲子同行，轻任务</button>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
