"use client";

import { CloudSlash, Pause, Play, SealCheck } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  decideHeroMedia,
  resolveHeroPlayback,
  type HeroConnectionProfile,
  type HeroMediaDecision,
  type HeroPlaybackPreference,
} from "@/lib/hero-media";

type NetworkInformationLike = HeroConnectionProfile & {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

const initialDecision: HeroMediaDecision = {
  playVideo: false,
  reason: "hidden-document",
};

function connectionFor(navigatorValue: NavigatorWithConnection) {
  return navigatorValue.connection ?? navigatorValue.mozConnection ?? navigatorValue.webkitConnection ?? null;
}

function playbackMessage(decision: HeroMediaDecision, playbackFailed: boolean, playAttemptFailed: boolean, isPlaying: boolean) {
  if (playbackFailed) return "视频文件暂时无法加载，已保留备用概念画面";
  if (playAttemptFailed) return "浏览器阻止了自动播放，可点击按钮重新播放";
  if (decision.reason === "reduced-motion") return "已按减少动态设置暂停，可手动播放同一段视频";
  if (decision.reason === "save-data" || decision.reason === "slow-network") {
    return "已为当前网络暂停，可手动播放同一段视频";
  }
  if (decision.reason === "hidden-document") return "页面暂不可见，视频已暂停";
  return isPlaying ? "本项目原创云雾动效正在静音循环播放" : "动态视频已暂停，可随时继续播放";
}

export function HeroJourneyMedia({
  fallbackImage,
  fallbackDisclosure,
  ariaLabel,
  className,
}: {
  fallbackImage: string;
  fallbackDisclosure: string;
  ariaLabel: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [decision, setDecision] = useState(initialDecision);
  const [preference, setPreference] = useState<HeroPlaybackPreference>("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [playAttemptFailed, setPlayAttemptFailed] = useState(false);
  const reducedMotion = Boolean(prefersReducedMotion);

  useEffect(() => {
    const navigatorValue = navigator as NavigatorWithConnection;
    const connection = connectionFor(navigatorValue);
    const update = () => {
      setDecision(decideHeroMedia({
        reducedMotion,
        connection,
        documentHidden: document.visibilityState === "hidden",
      }));
    };
    update();
    connection?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      connection?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [reducedMotion]);

  const shouldPlay = resolveHeroPlayback({ decision, preference, playbackFailed });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    const playback = video.play();
    if (playback && typeof playback.catch === "function") {
      void playback.catch(() => {
        setPlayAttemptFailed(true);
        setPreference("pause");
        setIsPlaying(false);
      });
    }
  }, [shouldPlay]);

  function togglePlayback() {
    if (isPlaying || shouldPlay) {
      setPreference("pause");
      videoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    setPlayAttemptFailed(false);
    setPreference("play");
  }

  return (
    <motion.figure
      initial={false}
      className={`min-w-0 ${className ?? ""}`}
      aria-label={ariaLabel}
      data-media-mode={isPlaying ? "video" : "paused"}
    >
      <div data-hero-frame className="relative aspect-video overflow-hidden rounded-[2rem] border border-white/75 bg-[#dce3d8] shadow-[0_28px_72px_rgba(31,63,52,.18)]">
        {playbackFailed ? (
          <Image
            src={fallbackImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 52vw, (min-width: 768px) 48vw, 94vw"
            className="object-cover object-center"
          />
        ) : null}
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover object-[68%_center] ${playbackFailed ? "opacity-0" : "opacity-100"}`}
          src="/assets/hero/public/cloud-loop.mp4"
          poster="/assets/hero/public/cloud-loop-poster.webp"
          preload={shouldPlay ? "metadata" : "none"}
          autoPlay={decision.playVideo}
          muted
          loop
          playsInline
          disablePictureInPicture
          aria-label="六祖云游 AI 概念动态视频"
          onPlaying={() => {
            setPlaybackFailed(false);
            setPlayAttemptFailed(false);
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setPlaybackFailed(true);
            setIsPlaying(false);
          }}
        />
      </div>

      <figcaption className="grid gap-3 px-1 pt-4 text-[#52685f] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" data-hero-disclosure>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-[#35584c]">
            <SealCheck size={16} weight="duotone" aria-hidden="true" />
            AI 概念影像 · 非实景
          </p>
          <p className="mt-1.5 max-w-[58ch] text-[11px] leading-5">
            视频为 AI 概念影像，不证明真实地理、路线、建筑或当前开放状态。
            {playbackFailed ? ` 备用画面：${fallbackDisclosure}。` : ""}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-5" aria-live="polite" data-hero-video-status>
            {!isPlaying ? <CloudSlash className="mt-0.5 shrink-0" size={14} weight="duotone" aria-hidden="true" /> : null}
            {playbackMessage(decision, playbackFailed, playAttemptFailed, isPlaying)}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePlayback}
          disabled={playbackFailed}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#173f35]/18 bg-white/68 px-4 text-xs font-semibold text-[#274f43] transition-colors hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
          aria-pressed={isPlaying}
          data-hero-video-toggle
        >
          {isPlaying ? <Pause size={16} weight="fill" aria-hidden="true" /> : <Play size={16} weight="fill" aria-hidden="true" />}
          {isPlaying ? "暂停动态视频" : "播放动态视频"}
        </button>
      </figcaption>
    </motion.figure>
  );
}
