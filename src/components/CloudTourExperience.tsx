"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle,
  CircleNotch,
  Headphones,
  MapPin,
  Pause,
  Play,
  SealCheck,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/cloud-tour/cloud-tour.module.css";
import {
  AI_GUIDE_FACT_TYPE_LABELS,
  AI_GUIDE_REVIEW_STATUS_LABELS,
  AI_GUIDE_SOURCE_STATUS_LABELS,
} from "@/lib/ai-guide/types";
import { getScenicSpotImage, type ScenicSpotId } from "@/lib/scenic-image-registry";
import {
  CLOUD_TOUR_BOUNDARY_NOTICE,
  cloudTourRoutes,
  cloudTourStations,
  getCloudTourStation,
  isCloudTourQuizChoiceCorrect,
  resolveCloudTourSelection,
  type CloudTourStation,
} from "@/lib/cloud-tour";
import {
  CLOUD_TOUR_STORAGE_KEY,
  clearCloudTourProgress,
  completeCloudTourProgress,
  createCloudTourProgress,
  moveCloudTourProgress,
  readCloudTourProgress,
  stampCloudTourProgress,
  writeCloudTourProgress,
  type CloudTourProgress,
} from "@/lib/cloud-tour-store";
import { useAccessibilityPreferences } from "@/lib/use-accessibility-preferences";
import { AccessibleDialog } from "./AccessibleDialog";

const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#173f35] px-5 py-3 text-sm font-medium text-[#fffaf0] transition-transform duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#173f35]/15 bg-white/55 px-4 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-white/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

const speechRates = [
  { value: 0.8, label: "慢速" },
  { value: 1, label: "标准" },
  { value: 1.25, label: "稍快" },
] as const;

type SpeechStatus = "idle" | "speaking" | "paused";

function getSceneClass(station: CloudTourStation): string {
  if (station.spot.category === "山水") return styles.sceneNature;
  if (station.spot.category === "休闲") return styles.sceneLeisure;
  return styles.sceneCulture;
}

function LoadingCloudTour() {
  return (
    <main className="paper-noise min-h-[100dvh] px-4 py-8 md:px-8" aria-busy="true" aria-label="正在读取云游进度">
      <div className="mx-auto max-w-[1400px] animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-36 rounded-full bg-[#173f35]/8" />
        <div className="mt-16 h-12 max-w-xl rounded-2xl bg-[#173f35]/8" />
        <div className="mt-5 h-20 max-w-2xl rounded-2xl bg-[#173f35]/6" />
        <div className="mt-12 grid gap-6 md:grid-cols-[1.08fr_.92fr]">
          <div className="h-[26rem] rounded-[2rem] bg-[#173f35]/8" />
          <div className="space-y-4"><div className="h-16 rounded-2xl bg-[#173f35]/7" /><div className="h-52 rounded-2xl bg-[#173f35]/7" /></div>
        </div>
      </div>
      <span className="sr-only">正在读取保存在此设备上的线上云游章节和内容印章。</span>
    </main>
  );
}

function BoundaryNotice() {
  return (
    <div className="flex items-start gap-3 rounded-[1.4rem] border border-[#b88a43]/25 bg-[#fffaf0]/72 p-4 text-sm leading-6 text-[#5e6d65]">
      <WarningCircle className="mt-0.5 shrink-0 text-[#9b7a42]" size={21} weight="duotone" aria-hidden="true" />
      <p><strong className="text-[#35564b]">线上云游，不是现场导航。</strong> {CLOUD_TOUR_BOUNDARY_NOTICE}</p>
    </div>
  );
}

export function CloudTourExperience() {
  const accessibilityPreferences = useAccessibilityPreferences();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<CloudTourProgress | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [quizChoice, setQuizChoice] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [speechSupport, setSpeechSupport] = useState<"checking" | "available" | "unavailable">("checking");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [speechMuted, setSpeechMuted] = useState(false);
  const [speechRate, setSpeechRate] = useState<(typeof speechRates)[number]["value"]>(1);
  const [speechMessage, setSpeechMessage] = useState<string | null>(null);
  const stationHeadingRef = useRef<HTMLHeadingElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const effectiveSpeechMuted = speechMuted || accessibilityPreferences.muted;

  const stopSpeech = useCallback((message?: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setSpeechStatus("idle");
    if (message) setSpeechMessage(message);
  }, []);

  useEffect(() => {
    if (!accessibilityPreferences.muted) return;
    const timer = window.setTimeout(() => stopSpeech("全局辅助设置已静音，朗读已停止。"), 0);
    return () => window.clearTimeout(timer);
  }, [accessibilityPreferences.muted, stopSpeech]);

  useEffect(() => {
    const load = () => {
      const result = readCloudTourProgress();
      setProgress(result.progress);
      setStorageError(result.error);
      if (result.progress) setNotice("已恢复保存在此设备上的云游进度。");
      setLoading(false);
    };

    const initialLoadTimer = window.setTimeout(() => {
      load();
      const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
      setSpeechSupport(supportsSpeech ? "available" : "unavailable");
    }, 0);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CLOUD_TOUR_STORAGE_KEY && event.key !== null) return;
      const result = readCloudTourProgress();
      stopSpeech();
      setProgress(result.progress);
      setStorageError(result.error);
      setQuizChoice(null);
      setQuizFeedback(null);
      setNotice(result.progress ? "已同步此设备另一页面的云游进度。" : "另一页面已清除云游进度。");
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener("storage", handleStorage);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [stopSpeech]);

  const currentStation = useMemo(() => {
    if (!progress) return null;
    return getCloudTourStation(progress.stopIds[progress.currentIndex]);
  }, [progress]);

  const selection = useMemo(() => {
    if (!progress) return null;
    return resolveCloudTourSelection(progress.selectionKind, progress.selectionId);
  }, [progress]);

  const commitProgress = useCallback((next: CloudTourProgress, successNotice: string) => {
    setProgress(next);
    const result = writeCloudTourProgress(next);
    if (result.ok) {
      setStorageError(null);
      setNotice(successNotice);
    } else {
      setStorageError(result.error ?? "本机保存失败。");
      setNotice(null);
    }
  }, []);

  const focusStationHeading = () => {
    window.requestAnimationFrame(() => stationHeadingRef.current?.focus());
  };

  const startSelection = (kind: "route" | "station", id: string) => {
    stopSpeech();
    setQuizChoice(null);
    setQuizFeedback(null);
    setSpeechMessage(null);
    const next = createCloudTourProgress(kind, id);
    commitProgress(next, "云游已开始，进度已保存在此设备。 ");
    setClearConfirming(false);
    focusStationHeading();
  };

  const moveTo = (nextIndex: number) => {
    if (!progress) return;
    stopSpeech();
    setQuizChoice(null);
    setQuizFeedback(null);
    setSpeechMessage(null);
    const next = moveCloudTourProgress(progress, nextIndex);
    commitProgress(next, `已进入第 ${nextIndex + 1} 章，并保存进度。`);
    focusStationHeading();
  };

  const completeTour = () => {
    if (!progress) return;
    stopSpeech();
    const next = completeCloudTourProgress(progress);
    commitProgress(next, "这次线上云游已完成，并保存在此设备。 ");
  };

  const restartTour = () => {
    if (!progress) return;
    stopSpeech();
    setQuizChoice(null);
    setQuizFeedback(null);
    setSpeechMessage(null);
    const next = createCloudTourProgress(progress.selectionKind, progress.selectionId);
    commitProgress(next, "已从第一章重新开始。 ");
    focusStationHeading();
  };

  const confirmClear = () => {
    stopSpeech();
    const result = clearCloudTourProgress();
    setProgress(null);
    setClearConfirming(false);
    setQuizChoice(null);
    setQuizFeedback(null);
    setSpeechMessage(null);
    if (result.ok) {
      setStorageError(null);
      setNotice("已清除这台设备上的云游进度与内容印章。");
    } else {
      setStorageError(result.error ?? "浏览器未确认删除云游记录。");
      setNotice(null);
    }
  };

  const submitQuiz = (event: FormEvent) => {
    event.preventDefault();
    if (!progress || !currentStation || !quizChoice) {
      setQuizFeedback({ kind: "error", text: "请先选择一个答案。" });
      return;
    }

    if (!isCloudTourQuizChoiceCorrect(currentStation.id, quizChoice)) {
      setQuizFeedback({ kind: "error", text: "这项不能由当前资料支持。回到讲解里找线索，再试一次。" });
      return;
    }

    const next = stampCloudTourProgress(progress, currentStation.id);
    commitProgress(next, "内容问答已通过，云游印章已保存。 ");
    setQuizFeedback({ kind: "success", text: `回答有据：可由讲解与 [${currentStation.quiz.sourceId}] 支持。已收下内容印章。` });
  };

  const toggleSpeech = () => {
    if (!currentStation || speechSupport !== "available") return;
    if (effectiveSpeechMuted) {
      setSpeechMessage("当前处于静音状态；取消静音后再点击播放。 ");
      return;
    }

    const synth = window.speechSynthesis;
    if (speechStatus === "speaking") {
      synth.pause();
      setSpeechStatus("paused");
      setSpeechMessage("讲解已暂停。 ");
      return;
    }
    if (speechStatus === "paused") {
      synth.resume();
      setSpeechStatus("speaking");
      setSpeechMessage("继续朗读讲解。 ");
      return;
    }

    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(currentStation.story.body);
      utterance.lang = "zh-CN";
      utterance.rate = speechRate;
      utterance.volume = 1;
      utterance.onend = () => {
        utteranceRef.current = null;
        setSpeechStatus("idle");
        setSpeechMessage("讲解朗读完毕。 ");
      };
      utterance.onerror = (event) => {
        utteranceRef.current = null;
        setSpeechStatus("idle");
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setSpeechMessage("浏览器没有完成朗读，你仍可阅读文字讲解。 ");
        }
      };
      utteranceRef.current = utterance;
      synth.speak(utterance);
      setSpeechStatus("speaking");
      setSpeechMessage("正在使用浏览器本地语音朗读。 ");
    } catch {
      setSpeechStatus("idle");
      setSpeechMessage("浏览器没有启动朗读，你仍可阅读文字讲解。 ");
    }
  };

  const toggleMute = () => {
    if (accessibilityPreferences.muted) {
      setSpeechMessage("全局静音正在生效；请先从“显示与辅助”取消静音。 ");
      return;
    }
    if (speechMuted) {
      setSpeechMuted(false);
      setSpeechMessage("已取消静音；语音不会自动播放。 ");
      return;
    }
    stopSpeech("已静音并停止朗读；系统不会自动重播。 ");
    setSpeechMuted(true);
  };

  const changeSpeechRate = (value: number) => {
    setSpeechRate(value as (typeof speechRates)[number]["value"]);
    if (speechStatus !== "idle") stopSpeech("语速已调整；请再次点击播放。 ");
    else setSpeechMessage("语速已调整；语音不会自动播放。 ");
  };

  if (loading) return <LoadingCloudTour />;

  const hasContent = cloudTourRoutes.length > 0 && cloudTourStations.length > 0;
  const currentIsStamped = currentStation ? progress?.stampedStopIds.includes(currentStation.id) ?? false : false;
  const currentPosition = progress ? progress.currentIndex + 1 : 0;
  const progressPercent = progress ? Math.round((currentPosition / progress.stopIds.length) * 100) : 0;
  const isLastChapter = progress ? progress.currentIndex === progress.stopIds.length - 1 : false;
  const currentSceneImage = currentStation
    ? getScenicSpotImage(currentStation.spot.id as ScenicSpotId, { allowContextual: true })
    : null;

  return (
    <main className="paper-noise min-h-[100dvh] overflow-hidden pb-12">
      <header className="sticky top-0 z-40 border-b border-[#173f35]/10 bg-[#f7f1e7]/92 backdrop-blur-xl">
        <div className="mx-auto grid min-h-16 max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 md:px-8">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-medium" aria-label="返回六祖云游首页">
            <ArrowLeft size={18} aria-hidden="true" />首页
          </Link>
          <div className="text-center"><strong className="block text-sm tracking-[.16em]">六祖云游模式</strong><span className="hidden text-[10px] text-[#53645c] sm:block">纯线上 · 不调用定位</span></div>
          {progress ? (
            <button type="button" onClick={() => setClearConfirming(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-medium text-[#79584f] sm:px-3" aria-label="清除云游进度">
              <Trash size={17} aria-hidden="true" /> <span className="hidden sm:inline">清除进度</span>
            </button>
          ) : <span className="w-11" aria-hidden="true" />}
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <section className="grid gap-8 py-12 md:grid-cols-[1.08fr_.92fr] md:items-end md:py-18" aria-labelledby="cloud-tour-title">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#b88a43]/25 bg-white/55 px-3 py-1.5 text-xs font-medium text-[#6c604b]"><BookOpenText size={16} weight="duotone" aria-hidden="true" />有出处的线上文化章节</span>
            <h1 id="cloud-tour-title" className="cultural-page-title mt-6 max-w-[12ch] text-4xl md:text-6xl">不在现场，也能循着证据走一程</h1>
            <p className="mt-6 max-w-[60ch] text-base leading-8 text-[#5d6f67]">选择一组云游章节，逐站阅读、主动听讲解、回答一题并收集内容印章。每条讲解都标注资料类型与来源。</p>
          </div>
          <BoundaryNotice />
        </section>

        {(storageError || notice) && (
          <div className={`mb-7 flex items-start gap-3 rounded-[1.3rem] border px-4 py-3 text-sm leading-6 ${storageError ? "border-[#9b453c]/20 bg-[#fff4ec] text-[#75524b]" : "border-[#466a57]/20 bg-[#eef4ea] text-[#496255]"}`} role={storageError ? "alert" : "status"} aria-live="polite">
            {storageError ? <WarningCircle className="mt-0.5 shrink-0" size={19} aria-hidden="true" /> : <CheckCircle className="mt-0.5 shrink-0" size={19} weight="duotone" aria-hidden="true" />}
            <span>{storageError ?? notice}</span>
          </div>
        )}

        {clearConfirming && (
          <AccessibleDialog
            onClose={() => setClearConfirming(false)}
            labelledBy="clear-cloud-tour-title"
            describedBy="clear-cloud-tour-description"
            className="m-auto w-[min(92vw,34rem)] rounded-[1.4rem]"
          >
            <section className="flex flex-col gap-5 p-5 sm:p-6">
              <div><h2 id="clear-cloud-tour-title" className="font-semibold">确认清除云游进度？</h2><p id="clear-cloud-tour-description" className="mt-1 text-sm leading-6 text-[#6d6f65]">将删除这台设备上的章节进度和内容印章，不影响其他旅程数据。</p></div>
              <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setClearConfirming(false)} className={secondaryButtonClass}>保留记录</button><button type="button" onClick={confirmClear} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#8b433a] px-5 py-3 text-sm font-medium text-white active:scale-[0.98]"><Trash size={17} />确认清除</button></div>
            </section>
          </AccessibleDialog>
        )}

        {!hasContent ? (
          <section className="rounded-[2rem] border border-dashed border-[#173f35]/20 bg-white/35 px-6 py-14 text-center" role="alert">
            <WarningCircle className="mx-auto text-[#9b7a42]" size={30} weight="duotone" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-semibold">云游内容暂不可用</h2>
            <p className="mx-auto mt-3 max-w-[48ch] text-sm leading-7 text-[#66776f]">这个地点的讲解资料暂不完整，请稍后再来看看。</p>
          </section>
        ) : !progress ? (
          <CloudTourSetup onStart={startSelection} />
        ) : progress.status === "COMPLETED" && selection ? (
          <section className="grid gap-8 rounded-[2.2rem] border border-[#173f35]/10 bg-[#173f35] px-6 py-10 text-[#fffaf0] md:grid-cols-[1fr_.85fr] md:px-10 md:py-14" aria-labelledby="cloud-tour-complete-title">
            <div>
              <SealCheck size={36} weight="duotone" className="text-[#d2b070]" aria-hidden="true" />
              <p className="mt-7 text-xs uppercase tracking-[.22em] text-[#d2b070]">Cloud tour completed</p>
              <h2 id="cloud-tour-complete-title" className="mt-3 text-4xl font-semibold tracking-[-.045em] md:text-5xl">这次线上云游已完成</h2>
              <p className="mt-5 max-w-[55ch] text-sm leading-7 text-white/68">你读完了“{selection.title}”的 {progress.stopIds.length} 个内容章节，收下 {progress.stampedStopIds.length} 枚内容印章。它们是学习记录，不代表实际到访。</p>
              <div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={restartTour} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#fffaf0] px-5 py-3 text-sm font-medium text-[#173f35] active:scale-[0.98]"><ArrowLeft size={17} />再云游一遍</button><button type="button" onClick={() => setClearConfirming(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white active:scale-[0.98]">选择另一条</button></div>
            </div>
            <ol className="divide-y divide-white/12 border-y border-white/12" aria-label="已完成章节">
              {progress.stopIds.map((stopId, index) => {
                const station = getCloudTourStation(stopId);
                if (!station) return null;
                return <li key={stopId} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 py-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs">{index + 1}</span><span><strong className="block text-sm">{station.spot.name}</strong><span className="mt-1 block text-xs text-white/55">{AI_GUIDE_FACT_TYPE_LABELS[station.story.factTypes[0]]}</span></span>{progress.stampedStopIds.includes(stopId) ? <SealCheck size={21} className="text-[#d2b070]" aria-label="已获得内容印章" /> : <span className="text-xs text-white/45">未答题</span>}</li>;
              })}
            </ol>
          </section>
        ) : currentStation && selection ? (
          <section aria-labelledby="active-cloud-tour-title">
            <div className="grid gap-4 border-y border-[#173f35]/12 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b7a42]">{progress.selectionKind === "route" ? "云游章节组" : "单站云游"}</p><h2 id="active-cloud-tour-title" className="cultural-page-title mt-1 text-xl">{selection.title}</h2><p className="mt-1 text-xs leading-5 text-[#788078]">{progress.selectionKind === "route" ? "线上阅读顺序，不代表现场路线" : "独立线上内容，不代表实际到访"}</p></div>
              <div className="min-w-52"><div className="flex items-center justify-between text-xs text-[#6c786f]"><span>第 {currentPosition} / {progress.stopIds.length} 章</span><span>{progressPercent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#173f35]/10" aria-hidden="true"><div className="h-full rounded-full bg-[#b88a43] transition-transform duration-250 ease-in-out motion-reduce:transition-none" style={{ transform: `translateX(${progressPercent - 100}%)` }} /></div></div>
            </div>

            <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(22rem,.98fr)] lg:items-start">
              <div>
                <article key={currentStation.id} className={`${styles.scene} ${getSceneClass(currentStation)} ${styles.stationEnter} p-6 sm:p-8`} aria-labelledby="station-title">
                  {currentSceneImage ? (
                    <Image
                      src={currentSceneImage.asset.src}
                      alt={currentSceneImage.asset.alt}
                      fill
                      sizes="(min-width: 1024px) 52vw, 100vw"
                      className={styles.sceneImage}
                    />
                  ) : null}
                  <span className={styles.sceneVeil} aria-hidden="true" />
                  <div className="relative z-10 flex h-full min-h-[21rem] flex-col justify-between md:min-h-[23rem]">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-white/55 bg-[#fffaf0]/78 px-3 py-1.5 text-xs font-medium backdrop-blur-md">线上第 {currentPosition} 章</span><span className="rounded-full border border-white/55 bg-[#fffaf0]/78 px-3 py-1.5 text-xs text-[#53635b] backdrop-blur-md">{currentStation.spot.verification}</span></div>
                    <div className="max-w-xl rounded-[1.6rem] border border-white/55 bg-[#fffaf0]/82 p-5 shadow-[0_18px_45px_rgba(23,63,53,.12)] backdrop-blur-lg sm:p-6">
                      <span className="text-xs font-semibold text-[#8d6b38]">{currentStation.spot.category} · {AI_GUIDE_FACT_TYPE_LABELS[currentStation.story.factTypes[0]]}</span>
                      <h3 id="station-title" ref={stationHeadingRef} tabIndex={-1} className="cultural-beiwei founder-cloud-qingke mt-2 text-3xl outline-none sm:text-4xl">{currentStation.spot.name}</h3>
                      <p className="mt-3 text-sm leading-7 text-[#53685f]">{currentStation.spot.subtitle}</p>
                    </div>
                    {currentSceneImage ? (
                      <p className={styles.sceneDisclosure}>
                        {currentSceneImage.disclosure ?? `${currentSceneImage.asset.subjectLabel}登记实景`}
                      </p>
                    ) : null}
                  </div>
                </article>

                <ol className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2" aria-label="云游章节进度">
                  {progress.stopIds.map((stopId, index) => {
                    const station = getCloudTourStation(stopId);
                    if (!station) return null;
                    const isCurrent = index === progress.currentIndex;
                    const isVisited = progress.visitedStopIds.includes(stopId);
                    return <li key={stopId} className={`min-h-16 rounded-[1.1rem] border px-3 py-3 text-xs ${isCurrent ? "border-[#b88a43] bg-[#fffaf0]" : isVisited ? "border-[#173f35]/10 bg-white/40" : "border-[#173f35]/8 bg-transparent text-[#566861]"}`} aria-current={isCurrent ? "step" : undefined}><span className="block text-[10px] text-[#745f3e]">{isVisited ? "已阅读" : "未开始"} · {index + 1}</span><strong className="mt-1 block">{station.spot.name}</strong></li>;
                  })}
                </ol>
              </div>

              <div className={`${styles.stationEnter} space-y-7`}>
                <section aria-labelledby="story-heading" className="border-t border-[#173f35]/14 pt-5">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e4eadf] px-2.5 py-1 text-xs font-medium text-[#3f624f]">{AI_GUIDE_FACT_TYPE_LABELS[currentStation.story.factTypes[0]]}</span><span className="rounded-full bg-[#efe4d3] px-2.5 py-1 text-xs text-[#795f39]">{AI_GUIDE_REVIEW_STATUS_LABELS[currentStation.story.sources[0].reviewStatus]}</span></div>
                  <h3 id="story-heading" className="mt-5 text-2xl font-semibold tracking-[-.03em]">文字讲解</h3>
                  <p className="cultural-quote mt-4 text-base text-[#566a61]">{currentStation.story.body}</p>
                </section>

                <section aria-labelledby="speech-heading" className="rounded-[1.5rem] border border-[#173f35]/10 bg-white/48 p-5">
                  <div className="flex items-center gap-2"><Headphones size={21} weight="duotone" className="text-[#9b7a42]" aria-hidden="true" /><h3 id="speech-heading" className="font-semibold">浏览器朗读</h3></div>
                  <p className="mt-2 text-xs leading-5 text-[#707a73]">只有你点击后才会播放；不会上传讲解，也不会自动开始下一章。</p>
                  {speechSupport === "checking" ? <p className="mt-4 inline-flex items-center gap-2 text-sm"><CircleNotch className="animate-spin motion-reduce:animate-none" size={17} />正在检查朗读能力</p> : speechSupport === "unavailable" ? <div className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#75524b]" role="alert"><WarningCircle className="mt-1 shrink-0" size={17} />当前浏览器不支持语音合成，请阅读上方文字讲解。</div> : <>
                    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={toggleSpeech} className={primaryButtonClass} aria-label={speechStatus === "speaking" ? "暂停讲解朗读" : speechStatus === "paused" ? "继续讲解朗读" : "播放讲解朗读"}>{speechStatus === "speaking" ? <Pause size={17} /> : <Play size={17} />} {speechStatus === "speaking" ? "暂停讲解" : speechStatus === "paused" ? "继续讲解" : "播放讲解"}</button><button type="button" onClick={() => stopSpeech("朗读已停止。 ")} disabled={speechStatus === "idle"} className={secondaryButtonClass}><Stop size={17} />停止</button><button type="button" onClick={toggleMute} disabled={accessibilityPreferences.muted} className={secondaryButtonClass} aria-pressed={effectiveSpeechMuted}>{effectiveSpeechMuted ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}{accessibilityPreferences.muted ? "全局静音" : speechMuted ? "取消静音" : "静音"}</button></div>
                    <fieldset className="mt-4"><legend className="text-xs font-medium text-[#68766f]">朗读速度</legend><div className="mt-2 grid grid-cols-3 gap-2">{speechRates.map((rate) => <button key={rate.value} type="button" onClick={() => changeSpeechRate(rate.value)} aria-pressed={speechRate === rate.value} className={`min-h-11 rounded-xl border px-2 text-xs font-medium active:scale-[0.98] ${speechRate === rate.value ? "border-[#173f35] bg-[#173f35] text-white" : "border-[#173f35]/12 bg-[#fffaf0]/60"}`}>{rate.label}</button>)}</div></fieldset>
                  </>}
                  <p className="sr-only" aria-live="polite">{speechMessage}</p>
                  {speechMessage && <p className="mt-3 text-xs leading-5 text-[#69766f]" aria-hidden="true">{speechMessage}</p>}
                </section>

                <section aria-labelledby="source-heading" className="border-t border-[#173f35]/14 pt-5">
                  <h3 id="source-heading" className="font-semibold">来源与审核</h3>
                  <ul className="mt-3 divide-y divide-[#173f35]/10 border-y border-[#173f35]/10">{currentStation.story.sources.map((source) => <li key={source.id} className="py-4 text-xs leading-5 text-[#5f7169]"><strong className="block text-sm text-[#294c41]">[{source.id}] {source.title}</strong><span className="mt-1 block">{source.publisher} · 采集核对 {source.checkedAt}</span><span className="block">{AI_GUIDE_FACT_TYPE_LABELS[source.factType]} · {AI_GUIDE_SOURCE_STATUS_LABELS[source.sourceStatus]}</span><span className="block text-[#7c6e58]">{AI_GUIDE_REVIEW_STATUS_LABELS[source.reviewStatus]}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4">查看登记的原始来源</a>}</li>)}</ul>
                </section>

                <form onSubmit={submitQuiz} className="rounded-[1.6rem] border border-[#b88a43]/22 bg-[#f3eadc] p-5" aria-labelledby="quiz-heading">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#8d6b38]">内容印章任务</p><h3 id="quiz-heading" className="mt-2 text-lg font-semibold">{currentStation.quiz.question}</h3></div>{currentIsStamped && <SealCheck className="shrink-0 text-[#8d6b38]" size={26} weight="duotone" aria-label="本章内容印章已获得" />}</div>
                  <fieldset className="mt-4" disabled={currentIsStamped}><legend className="sr-only">选择一个答案</legend><div className="space-y-2">{currentStation.quiz.options.map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#173f35]/10 bg-[#fffaf0]/68 px-3 py-2.5 text-sm has-checked:border-[#173f35] has-checked:bg-white"><input type="radio" name={`quiz-${currentStation.id}`} value={option.id} checked={quizChoice === option.id} onChange={() => { setQuizChoice(option.id); setQuizFeedback(null); }} className="h-4 w-4 accent-[#173f35]" />{option.label}</label>)}</div></fieldset>
                  {currentIsStamped ? <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#496255]"><Check size={18} className="mt-1 shrink-0" />已获得本章内容印章。它只记录学习进度，不是现场到访证明。</p> : <button type="submit" className={`${primaryButtonClass} mt-4 w-full`}>提交答案并核对来源</button>}
                  {quizFeedback && <p className={`mt-3 text-sm leading-6 ${quizFeedback.kind === "success" ? "text-[#496255]" : "text-[#8b433a]"}`} role={quizFeedback.kind === "error" ? "alert" : "status"}>{quizFeedback.text}</p>}
                </form>

                <div className="flex flex-col gap-3 border-t border-[#173f35]/14 pt-5 sm:flex-row">
                  <button type="button" onClick={() => moveTo(progress.currentIndex - 1)} disabled={progress.currentIndex === 0} className={`${secondaryButtonClass} sm:flex-1`}><ArrowLeft size={17} />上一章</button>
                  {isLastChapter ? <button type="button" onClick={completeTour} className={`${primaryButtonClass} sm:flex-1`}>完成这次云游<SealCheck size={17} /></button> : <button type="button" onClick={() => moveTo(progress.currentIndex + 1)} className={`${primaryButtonClass} sm:flex-1`}>下一章<ArrowRight size={17} /></button>}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-[#9b453c]/20 bg-[#fff4ec] px-6 py-12 text-center" role="alert">
            <WarningCircle className="mx-auto text-[#8b433a]" size={30} weight="duotone" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-semibold">无法恢复这个云游章节</h2>
            <p className="mx-auto mt-3 max-w-[48ch] text-sm leading-7 text-[#6e655f]">对应站点、讲解或来源没有通过当前数据校验，系统已停止展示，避免补写未知内容。</p>
            <button type="button" onClick={() => setClearConfirming(true)} className={`${primaryButtonClass} mt-6`}>清除失效记录并重新选择</button>
          </section>
        )}
      </div>
    </main>
  );
}

function CloudTourSetup({ onStart }: { onStart: (kind: "route" | "station", id: string) => void }) {
  return (
    <div className="grid gap-12 pb-14 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
      <section aria-labelledby="route-choice-title">
        <div className="flex items-end justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Route chapters</p><h2 id="route-choice-title" className="cultural-page-title mt-2 text-3xl md:text-4xl">选择云游章节组</h2></div><span className="text-xs text-[#7a8079]">{cloudTourRoutes.length} 组</span></div>
        <div className="mt-6 divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
          {cloudTourRoutes.map((route, index) => (
            <article key={route.id} className="grid gap-4 py-6 sm:grid-cols-[42px_1fr_auto] sm:items-center">
              <span className="font-mono text-xs text-[#9b7a42]">0{index + 1}</span>
              <div><span className="text-xs text-[#758078]">{route.eyebrow}</span><h3 className="cultural-wenkai mt-1 text-xl">{route.title}</h3><p className="mt-2 text-sm leading-6 text-[#63736b]">{route.stopIds.map((stopId) => getCloudTourStation(stopId)?.spot.name).filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs leading-5 text-[#85847b]">{route.contentOrderNotice}</p></div>
              <button type="button" onClick={() => onStart("route", route.id)} className={secondaryButtonClass} aria-label={`按${route.title}开始云游`}>开始<ArrowRight size={16} /></button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="station-choice-title">
        <div className="flex items-end justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9b7a42]">Single station</p><h2 id="station-choice-title" className="mt-2 text-3xl font-semibold tracking-[-.04em] md:text-4xl">或只看一个站点</h2></div><span className="text-xs text-[#7a8079]">{cloudTourStations.length} 站</span></div>
        <div className="mt-6 divide-y divide-[#173f35]/12 border-y border-[#173f35]/12">
          {cloudTourStations.map((station) => <button key={station.id} type="button" onClick={() => onStart("station", station.id)} className="group grid min-h-20 w-full grid-cols-[1fr_auto] items-center gap-4 py-4 text-left active:scale-[0.99]" aria-label={`开始${station.spot.name}单站云游`}><span><span className="flex items-center gap-2 text-xs text-[#8a7552]"><MapPin size={15} weight="duotone" />{station.spot.category} · {station.spot.verification}</span><strong className="mt-1 block text-base">{station.spot.name}</strong></span><span className="grid h-11 w-11 place-items-center rounded-full border border-[#173f35]/12 transition-colors group-hover:bg-[#173f35] group-hover:text-white"><ArrowRight size={17} /></span></button>)}
        </div>
      </section>
    </div>
  );
}
