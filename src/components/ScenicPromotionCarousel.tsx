"use client";

import {
  ArrowLeft,
  ArrowRight,
  Circle,
  CloudSlash,
  Pause,
  Play,
  SealCheck,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  PROMOTION_MEDIA_ITEMS,
  PROMOTION_ROTATION_MS,
  promotionStaticReason,
  shouldAutoRotatePromotions,
  wrapPromotionIndex,
  type PromotionConnectionProfile,
  type PromotionMediaItem,
} from "@/lib/promotion-media";
import styles from "./ScenicPromotionCarousel.module.css";

type NetworkInformationLike = PromotionConnectionProfile & {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

function connectionFor(navigatorValue: NavigatorWithConnection) {
  return navigatorValue.connection ?? navigatorValue.mozConnection ?? navigatorValue.webkitConnection ?? null;
}

function MediaLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("http")) {
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  }
  return <Link href={href}>{children}</Link>;
}

function staticReasonLabel(reason: ReturnType<typeof promotionStaticReason>) {
  if (reason === "save-data") return "已按省流量设置切换为静态浏览";
  if (reason === "slow-network") return "当前网络较慢，已切换为静态浏览";
  return null;
}

type PromotionVisualHandle = {
  playVideo: () => void;
  pauseVideo: () => void;
};

type PromotionVisualProps = {
  item: PromotionMediaItem;
  staticMode: boolean;
  shouldPlayVideo: boolean;
  onPrimaryReady: () => void;
  onPrimaryError: () => void;
  onVideoPlayBlocked: (blocked: boolean) => void;
  onVideoEnded: () => void;
};

const PromotionVisual = forwardRef<PromotionVisualHandle, PromotionVisualProps>(function PromotionVisual({
  item,
  staticMode,
  shouldPlayVideo,
  onPrimaryReady,
  onPrimaryError,
  onVideoPlayBlocked,
  onVideoEnded,
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const displaySrc = item.kind === "video" ? item.posterSrc ?? item.fallbackSrc : item.src;

  useImperativeHandle(ref, () => ({
    playVideo() {
      const video = videoRef.current;
      if (!video) return;
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        void playAttempt
          .then(() => onVideoPlayBlocked(false))
          .catch(() => onVideoPlayBlocked(true));
      } else {
        onVideoPlayBlocked(false);
      }
    },
    pauseVideo() {
      videoRef.current?.pause();
    },
  }), [onVideoPlayBlocked]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    if (!shouldPlayVideo) {
      video.pause();
      return () => {
        active = false;
      };
    }
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      void playAttempt.catch(() => {
        if (active) onVideoPlayBlocked(true);
      });
    }
    return () => {
      active = false;
    };
  }, [onVideoPlayBlocked, shouldPlayVideo]);

  return (
    <div className={styles.visual} data-promotion-visual>
      <Image
        src={item.fallbackSrc}
        alt={primaryFailed ? "国恩寺实景备用画面，原宣传素材未载入" : ""}
        fill
        sizes="(min-width: 1024px) 58vw, 100vw"
        className={styles.fallbackImage}
        aria-hidden={primaryFailed ? undefined : "true"}
        priority={item.id === PROMOTION_MEDIA_ITEMS[0]?.id}
      />

      {!primaryFailed ? (
        <Image
          key={`${item.id}-poster`}
          src={displaySrc}
          alt={item.alt}
          fill
          sizes="(min-width: 1024px) 58vw, 100vw"
          className={styles.primaryImage}
          priority={item.id === PROMOTION_MEDIA_ITEMS[0]?.id}
          onLoad={onPrimaryReady}
          onError={() => {
            setPrimaryFailed(true);
            onPrimaryError();
          }}
        />
      ) : null}

      {item.kind === "video" && !staticMode && !primaryFailed ? (
        <video
          ref={videoRef}
          key={`${item.id}-video`}
          src={item.src}
          poster={item.posterSrc}
          className={styles.video}
          preload="metadata"
          muted
          playsInline
          disablePictureInPicture
          aria-label={item.alt}
          onCanPlay={() => {
            onPrimaryReady();
            onVideoPlayBlocked(false);
          }}
          onEnded={onVideoEnded}
          onError={() => {
            setPrimaryFailed(true);
            onPrimaryError();
          }}
        />
      ) : null}
    </div>
  );
});

export function ScenicPromotionCarousel({
  items = PROMOTION_MEDIA_ITEMS,
  className,
}: {
  items?: readonly PromotionMediaItem[];
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [connection, setConnection] = useState<PromotionConnectionProfile | null>(null);
  const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [videoPlayBlockedId, setVideoPlayBlockedId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [announcementMode, setAnnouncementMode] = useState<"off" | "polite">("off");
  const visualRef = useRef<PromotionVisualHandle>(null);

  const safeItems = items.length > 0 ? items : PROMOTION_MEDIA_ITEMS.slice(0, 1);
  const safeIndex = wrapPromotionIndex(activeIndex, safeItems.length);
  const activeItem = safeItems[safeIndex];
  const staticReason = useMemo(() => promotionStaticReason({
    connection,
  }), [connection]);
  const staticMode = staticReason !== null;
  const autoRotating = activeItem?.kind === "image" && shouldAutoRotatePromotions({
    itemCount: safeItems.length,
    userPaused,
    documentHidden,
    staticReason,
  });
  const shouldPlayVideo = activeItem?.kind === "video"
    && playingVideoId === activeItem.id
    && !staticMode
    && !documentHidden;
  const videoPlayBlocked = videoPlayBlockedId === activeItem?.id;
  const handleVideoPlayBlocked = useCallback((blocked: boolean) => {
    setVideoPlayBlockedId(blocked ? activeItem?.id ?? null : null);
  }, [activeItem?.id]);

  useEffect(() => {
    const navigatorValue = navigator as NavigatorWithConnection;
    const networkConnection = connectionFor(navigatorValue);
    const updateNetwork = () => setConnection(networkConnection
      ? { saveData: networkConnection.saveData, effectiveType: networkConnection.effectiveType }
      : null);
    const updateVisibility = () => setDocumentHidden(document.visibilityState === "hidden");
    updateNetwork();
    updateVisibility();
    networkConnection?.addEventListener?.("change", updateNetwork);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      networkConnection?.removeEventListener?.("change", updateNetwork);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!autoRotating) return;
    const timer = window.setTimeout(() => {
      setAnnouncementMode("off");
      setActiveIndex((current) => wrapPromotionIndex(current + 1, safeItems.length));
    }, PROMOTION_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [autoRotating, safeItems.length, safeIndex]);

  if (!activeItem) return null;

  const activeReady = readyIds.has(activeItem.id);
  const activeFailed = failedIds.has(activeItem.id);
  const restrictedLabel = staticReasonLabel(staticReason);
  const visibleTitle = activeFailed ? "画面暂未载入" : activeItem.title;
  const visibleDisclosureLabel = activeFailed ? "静态备用画面" : activeItem.disclosureLabel;
  const visibleDisclosure = activeFailed
    ? "当前素材暂时无法载入，请稍后重试或浏览下一项内容。"
    : activeItem.disclosure;
  const visibleSummary = activeFailed
    ? "景区宣传内容正在准备中。"
    : activeItem.summary;
  const visibleSourceLabel = activeFailed ? "景区宣传专区" : activeItem.sourceLabel;
  const visibleSourceHref = activeFailed ? "/privacy" : activeItem.sourceHref;
  const visibleLicenseLabel = activeFailed ? "查看素材说明" : activeItem.licenseLabel;
  const visibleLicenseHref = activeFailed ? undefined : activeItem.licenseHref;
  const playbackStatus = activeFailed
    ? activeItem.kind === "video"
      ? "动态文件暂时无法加载，已显示静态备用画面"
      : "宣传画暂时无法加载，已显示静态备用画面"
    : videoPlayBlocked
      ? "浏览器阻止了视频自动播放，已保留静态封面"
      : restrictedLabel
        ?? (activeItem.kind === "video"
          ? playingVideoId === activeItem.id ? "视频播放中，结束后自动浏览下一项" : "点击播放视频，播放结束后继续浏览"
          : userPaused ? "自动轮播已暂停" : "图片每 4 秒自动切换");
  const ariaLiveMode = autoRotating ? "off" : announcementMode;
  const playbackButtonLabel = staticMode
    ? playbackStatus
    : activeItem.kind === "video"
      ? playingVideoId === activeItem.id ? "暂停当前视频" : "播放当前视频"
      : videoPlayBlocked
        ? "播放当前视频"
      : userPaused
        ? "继续自动轮播"
        : "暂停自动轮播";

  function goTo(index: number) {
    setAnnouncementMode("polite");
    setActiveIndex(wrapPromotionIndex(index, safeItems.length));
    setVideoPlayBlockedId(null);
    setPlayingVideoId(null);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(safeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(safeIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(safeItems.length - 1);
    }
  }

  return (
    <section
      className={`${styles.carousel} ${className ?? ""}`}
      role="region"
      aria-roledescription="轮播"
      aria-label="新兴与六祖文化宣传专区"
      onKeyDown={handleKeyDown}
      data-promotion-carousel
      data-auto-rotating={autoRotating}
      data-static-mode={staticMode}
    >
      <div
        className={styles.slide}
        role="group"
        aria-roledescription="幻灯片"
        aria-label={`第 ${safeIndex + 1} 张，共 ${safeItems.length} 张：${visibleTitle}`}
      >
        <PromotionVisual
          key={activeItem.id}
          ref={visualRef}
          item={activeItem}
          staticMode={staticMode}
          shouldPlayVideo={shouldPlayVideo}
          onPrimaryReady={() => setReadyIds((current) => new Set(current).add(activeItem.id))}
          onPrimaryError={() => setFailedIds((current) => new Set(current).add(activeItem.id))}
          onVideoPlayBlocked={handleVideoPlayBlocked}
          onVideoEnded={() => {
            setPlayingVideoId(null);
            goTo(safeIndex + 1);
          }}
        />

        <div className={styles.topBar}>
          <span className={styles.zoneLabel}>景区宣传专区</span>
          <span className={styles.counter} aria-hidden="true">
            {String(safeIndex + 1).padStart(2, "0")} / {String(safeItems.length).padStart(2, "0")}
          </span>
        </div>

        <div className={styles.truthBadge}>
          <SealCheck size={16} weight="duotone" aria-hidden="true" />
          <span>{visibleDisclosureLabel}</span>
        </div>

        <div className={styles.captionPanel}>
          <h2>{visibleTitle}</h2>
          <p>{visibleSummary}</p>
          <small>{visibleDisclosure}</small>
        </div>

        <div className={styles.transport} aria-label="宣传内容切换控件">
          <button type="button" onClick={() => goTo(safeIndex - 1)} aria-label="上一张宣传内容">
            <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <div className={styles.dots} role="group" aria-label="选择宣传内容">
            {safeItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`查看第 ${index + 1} 张：${item.title}`}
                aria-current={index === safeIndex ? "true" : undefined}
                title={item.title}
              >
                <Circle size={index === safeIndex ? 11 : 8} weight={index === safeIndex ? "fill" : "regular"} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => goTo(safeIndex + 1)} aria-label="下一张宣传内容">
            <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.playbackButton}
            onClick={() => {
              setAnnouncementMode("polite");
              if (activeItem.kind === "video") {
                if (playingVideoId === activeItem.id) {
                  visualRef.current?.pauseVideo();
                  setPlayingVideoId(null);
                  return;
                }
                setPlayingVideoId(activeItem.id);
                visualRef.current?.playVideo();
                return;
              }
              setUserPaused((paused) => !paused);
            }}
            disabled={staticMode}
            aria-pressed={activeItem.kind === "video" ? playingVideoId === activeItem.id : userPaused || staticMode}
            aria-label={playbackButtonLabel}
            title={playbackButtonLabel}
          >
            {activeItem.kind === "video"
              ? playingVideoId === activeItem.id
                ? <Pause size={17} weight="fill" aria-hidden="true" />
                : <Play size={17} weight="fill" aria-hidden="true" />
              : userPaused || staticMode
                ? <Play size={17} weight="fill" aria-hidden="true" />
                : <Pause size={17} weight="fill" aria-hidden="true" />}
          </button>
        </div>

        <div className={styles.provenance}>
          <div className={styles.sourceLine}>
            <span>{visibleSourceLabel}</span>
            <span aria-hidden="true">·</span>
            <MediaLink href={visibleSourceHref}>来源</MediaLink>
            {visibleLicenseHref ? (
              <>
                <span aria-hidden="true">·</span>
                <MediaLink href={visibleLicenseHref}>{visibleLicenseLabel}</MediaLink>
              </>
            ) : <span>{visibleLicenseLabel}</span>}
            {activeFailed ? (
              <>
                <span aria-hidden="true">·</span>
                <MediaLink href={activeItem.sourceHref}>原计划素材来源</MediaLink>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <MediaLink href={activeItem.officialReferenceHref}>官方了解更多</MediaLink>
          </div>
          <p className={styles.status} aria-live="off">
            {!activeReady || activeFailed || restrictedLabel || videoPlayBlocked
              ? <CloudSlash size={14} weight="duotone" aria-hidden="true" />
              : null}
            <span>{!activeReady && !activeFailed ? "宣传媒体载入中，备用画面已就绪" : playbackStatus}</span>
          </p>
        </div>
      </div>

      <p className={styles.srOnly} aria-live={ariaLiveMode} aria-atomic="true">
        当前展示：{visibleTitle}。{visibleDisclosureLabel}。{playbackStatus}。
      </p>
    </section>
  );
}
