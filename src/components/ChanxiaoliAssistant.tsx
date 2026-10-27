"use client";

import {
  ArrowUp,
  BookOpenText,
  ChatCenteredText,
  ClockCounterClockwise,
  DotsSixVertical,
  Microphone,
  Minus,
  SpeakerHigh,
  SpeakerSlash,
  StopCircle,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
} from "framer-motion";
import { usePathname } from "next/navigation";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseAIGuideAnswer, type AIGuideError, type AIGuideAnswer } from "@/lib/ai-guide/types";
import { PROJECT_DATA_CLEARED_EVENT } from "@/lib/accessibility-preferences";
import {
  CHANXIAOLI_LONG_PRESS_MS,
  CHANXIAOLI_STORAGE_KEY,
  DEFAULT_CHANXIAOLI_DATA,
  appendChanxiaoliHistory,
  createChanxiaoliHistoryItem,
  denormalizeAssistantPosition,
  normalizeAssistantPosition,
  readChanxiaoliAssistantData,
  writeChanxiaoliAssistantData,
  type ChanxiaoliAssistantData,
  type ChanxiaoliDock,
  type ChanxiaoliVisualState,
} from "@/lib/chanxiaoli-assistant";
import { useAccessibilityPreferences } from "@/lib/use-accessibility-preferences";
import { useSystemReducedMotion } from "@/lib/use-system-reduced-motion";
import { AccessibleDialog } from "./AccessibleDialog";

const widgetWidth = 108;
const widgetHeight = 132;
// Keep enough of a docked assistant inside the viewport for both pointer and
// keyboard users. 48px left the button's geometric centre outside the right
// edge, so browser automation and real taps near the edge could miss it.
const edgeReveal = 64;
const hiddenByDefault = ["/admin"];
const suggestions = ["国恩寺为什么重要？", "第一次来怎么选路线？", "哪些信息还没现场核验？"];

type AssistantStatus = "idle" | "loading" | "error";
type VoiceStatus = "idle" | "waiting" | "listening" | "speaking" | "unsupported" | "denied" | "error";

type CharacterPointerSession = {
  pointerId: number;
  pointerType: string;
  target: HTMLButtonElement;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  dragging: boolean;
  voiceStarted: boolean;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type WindowWithSpeechRecognition = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function isGuideError(value: unknown): value is AIGuideError {
  return typeof value === "object" && value !== null && "error" in value;
}

function storageTarget() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeBottomOffset() {
  return window.innerWidth < 1024 ? 104 : 20;
}

function visualStateLabel(state: ChanxiaoliVisualState) {
  const labels: Record<ChanxiaoliVisualState, string> = {
    resting: "安静等候",
    greeting: "向你问好",
    listening: "侧耳倾听",
    thinking: "核对资料",
    answering: "整理回答",
    success: "完成回答",
    route: "查看路线",
    pointing: "提示注意",
    walking: "陪你出发",
    reading: "翻看历史",
  };
  return labels[state];
}

function responseMessage(value: unknown) {
  if (isGuideError(value) && typeof value.error?.message === "string") return value.error.message;
  return "禅小荔暂时没有得到可展示的回答。";
}

export type ChanxiaoliAssistantProps = {
  endpoint?: string;
  hiddenPaths?: string[];
};

export function ChanxiaoliAssistant({
  endpoint = "/api/ai-guide",
  hiddenPaths = hiddenByDefault,
}: ChanxiaoliAssistantProps) {
  const pathname = usePathname();
  const accessibilityPreferences = useAccessibilityPreferences();
  const prefersReducedMotion = useSystemReducedMotion();
  const reduceMotion = Boolean(prefersReducedMotion);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const inputId = useId();
  const widgetRef = useRef<HTMLElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const visualTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const characterVoiceTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const voiceLongPressRef = useRef(false);
  const characterVoiceLongPressRef = useRef(false);
  const suppressCharacterClickRef = useRef(false);
  const characterPointerRef = useRef<CharacterPointerSession | null>(null);
  const characterPointerCleanupRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionShouldSubmitRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSequenceRef = useRef(0);
  const dataRef = useRef<ChanxiaoliAssistantData>(DEFAULT_CHANXIAOLI_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<ChanxiaoliAssistantData>(DEFAULT_CHANXIAOLI_DATA);
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [anchorHorizontal, setAnchorHorizontal] = useState<"left" | "right">("right");
  const [anchorVertical, setAnchorVertical] = useState<"above" | "below">("above");
  const [visualState, setVisualState] = useState<ChanxiaoliVisualState>("resting");
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [question, setQuestion] = useState("");
  const [latestAnswer, setLatestAnswer] = useState<AIGuideAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceMessage, setVoiceMessage] = useState("按住说话后会提交转写文字，并用浏览器朗读回答；这不是服务端实时语音通话。");
  const [storageMessage, setStorageMessage] = useState("");
  const effectiveMuted = data.muted || accessibilityPreferences.muted;

  const setTemporaryVisualState = useCallback((next: ChanxiaoliVisualState, fallback: ChanxiaoliVisualState = "resting") => {
    if (visualTimerRef.current !== null) window.clearTimeout(visualTimerRef.current);
    setVisualState(next);
    visualTimerRef.current = window.setTimeout(() => setVisualState(fallback), reduceMotion ? 0 : 1_800);
  }, [reduceMotion]);

  const calculatePosition = useCallback((nextData: ChanxiaoliAssistantData) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxX = Math.max(0, viewportWidth - widgetWidth);
    const maxY = Math.max(64, viewportHeight - widgetHeight - safeBottomOffset());

    let nextX = Math.max(12, maxX - 12);
    let nextY = Math.max(64, maxY - 48);
    if (nextData.position) {
      const restored = denormalizeAssistantPosition(
        nextData.position,
        viewportWidth,
        viewportHeight - safeBottomOffset(),
        widgetWidth,
        widgetHeight,
      );
      nextX = Math.min(maxX, Math.max(0, restored.x));
      nextY = Math.min(maxY, Math.max(64, restored.y));
    }
    if (nextData.dock === "left") nextX = -widgetWidth + edgeReveal;
    if (nextData.dock === "right") nextX = viewportWidth - edgeReveal;
    x.set(nextX);
    y.set(nextY);
    setAnchorHorizontal(nextX + widgetWidth / 2 < viewportWidth / 2 ? "left" : "right");
    setAnchorVertical(nextY < 390 ? "below" : "above");
  }, [x, y]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const result = readChanxiaoliAssistantData(storageTarget());
      const restored = { ...result.data, history: [...result.data.history] };
      dataRef.current = restored;
      setData(restored);
      setStorageMessage(result.error ?? "");
      setHydrated(true);
      calculatePosition(restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calculatePosition]);

  useEffect(() => {
    if (!hydrated) return;
    dataRef.current = data;
    const saved = writeChanxiaoliAssistantData(data, storageTarget());
    if (saved) return;
    const timer = window.setTimeout(() => {
      setStorageMessage("浏览器没有保存位置、静音或问答历史；本页仍可继续使用。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== CHANXIAOLI_STORAGE_KEY && event.key !== null) return;
      const result = readChanxiaoliAssistantData(storageTarget());
      const restored = { ...result.data, history: [...result.data.history] };
      dataRef.current = restored;
      setData(restored);
      setStorageMessage(result.error ?? "");
      calculatePosition(restored);
    };
    const reset = () => {
      const restored = { ...DEFAULT_CHANXIAOLI_DATA, history: [] };
      dataRef.current = restored;
      setData(restored);
      setLatestAnswer(null);
      setQuestion("");
      calculatePosition(restored);
    };
    const handleResize = () => calculatePosition(dataRef.current);
    window.addEventListener("storage", sync);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, reset);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, reset);
      window.removeEventListener("resize", handleResize);
    };
  }, [calculatePosition, hydrated]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      recognitionShouldSubmitRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      speechSequenceRef.current += 1;
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
      characterPointerCleanupRef.current?.();
      characterPointerCleanupRef.current = null;
      characterPointerRef.current = null;
      setPanelOpen(false);
      setHistoryOpen(false);
      setVoiceStatus("idle");
      setTemporaryVisualState("walking");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, setTemporaryVisualState]);

  useEffect(() => {
    if (!panelOpen || status === "loading") return;
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    const delay = latestAnswer ? 14_000 : 24_000;
    collapseTimerRef.current = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("[data-chanxiaoli-panel]")) return;
      setPanelOpen(false);
      setVisualState("resting");
    }, delay);
    return () => {
      if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    };
  }, [latestAnswer, panelOpen, question, status]);

  useEffect(() => {
    if (!accessibilityPreferences.muted || !utteranceRef.current) return;
    speechSequenceRef.current += 1;
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setVoiceStatus("idle");
    setVoiceMessage("全局辅助设置已静音，禅小荔朗读已停止。");
  }, [accessibilityPreferences.muted]);

  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    if (visualTimerRef.current !== null) window.clearTimeout(visualTimerRef.current);
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
    if (characterVoiceTimerRef.current !== null) window.clearTimeout(characterVoiceTimerRef.current);
    recognitionShouldSubmitRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    speechSequenceRef.current += 1;
    if (utteranceRef.current) window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    characterPointerCleanupRef.current?.();
    characterPointerCleanupRef.current = null;
    characterPointerRef.current = null;
  }, []);

  function updateData(patch: Partial<ChanxiaoliAssistantData>) {
    setData((current) => ({ ...current, ...patch }));
  }

  function stopSpeaking(message = "朗读已停止，可继续使用文字或语音提问。") {
    const utterance = utteranceRef.current;
    if (!utterance && voiceStatus !== "speaking") return;
    speechSequenceRef.current += 1;
    if (utterance) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    }
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();
    setVoiceStatus((current) => current === "speaking" ? "idle" : current);
    setVoiceMessage(message);
    setVisualState("resting");
  }

  function cancelRecognition(message = "语音输入已停止，可继续使用文字提问。") {
    recognitionShouldSubmitRef.current = false;
    voiceTranscriptRef.current = "";
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setVoiceStatus((current) => current === "waiting" || current === "listening" ? "idle" : current);
    setVoiceMessage(message);
  }

  function stopAllVoiceActivity(message?: string) {
    speechSequenceRef.current += 1;
    cancelRecognition(message);
    stopSpeaking(message);
  }

  function handleCharacterClick() {
    if (suppressCharacterClickRef.current) {
      suppressCharacterClickRef.current = false;
      return;
    }
    if (draggingRef.current) {
      draggingRef.current = false;
      return;
    }
    if (data.dock !== "none") {
      restoreFromEdge();
      return;
    }
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      if (panelOpen) {
        closeAssistantPanel();
        return;
      }
      setTemporaryVisualState("greeting", "greeting");
      setPanelOpen(true);
    }, 230);
  }

  function handleCharacterDoubleClick() {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    stopAllVoiceActivity("已打开问答历史，语音活动已停止。");
    setPanelOpen(false);
    setHistoryOpen(true);
    setVisualState("reading");
  }

  function persistPosition(nextX: number, nextY: number, dock: ChanxiaoliDock) {
    const position = normalizeAssistantPosition(
      Math.min(Math.max(nextX, 0), Math.max(0, window.innerWidth - widgetWidth)),
      Math.min(Math.max(nextY, 0), Math.max(0, window.innerHeight - widgetHeight - safeBottomOffset())),
      window.innerWidth,
      window.innerHeight - safeBottomOffset(),
      widgetWidth,
      widgetHeight,
    );
    updateData({ position, dock });
  }

  function finishDraggedPosition() {
    const maxX = Math.max(0, window.innerWidth - widgetWidth);
    const maxY = Math.max(64, window.innerHeight - widgetHeight - safeBottomOffset());
    const nextX = Math.min(maxX, Math.max(0, x.get()));
    const nextY = Math.min(maxY, Math.max(64, y.get()));
    const nearLeft = nextX <= 18;
    const nearRight = nextX >= maxX - 18;
    const dock: ChanxiaoliDock = nearLeft ? "left" : nearRight ? "right" : "none";
    x.set(dock === "left" ? -widgetWidth + edgeReveal : dock === "right" ? window.innerWidth - edgeReveal : nextX);
    y.set(nextY);
    setAnchorHorizontal(nextX + widgetWidth / 2 < window.innerWidth / 2 ? "left" : "right");
    setAnchorVertical(nextY < 390 ? "below" : "above");
    setPanelOpen(false);
    persistPosition(nextX, nextY, dock);
    setTemporaryVisualState(dock === "none" ? "walking" : "resting");
    window.setTimeout(() => {
      draggingRef.current = false;
      suppressCharacterClickRef.current = false;
    }, 0);
  }

  function cleanupCharacterPointerListeners() {
    const cleanup = characterPointerCleanupRef.current;
    characterPointerCleanupRef.current = null;
    cleanup?.();
  }

  function handleCharacterPointerMove(event: PointerEvent) {
    const session = characterPointerRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const deltaX = event.clientX - session.startClientX;
    const deltaY = event.clientY - session.startClientY;
    const movement = Math.hypot(deltaX, deltaY);

    if (!session.dragging && movement >= 8) {
      session.dragging = true;
      draggingRef.current = true;
      suppressCharacterClickRef.current = true;
      cancelCharacterVoiceTimer();
      characterVoiceLongPressRef.current = false;
      stopAllVoiceActivity("拖动禅小荔时已停止语音，可松开后重新提问。");
      setPanelOpen(false);
      setVisualState("walking");
    }
    if (!session.dragging) return;
    if (event.cancelable) event.preventDefault();

    const maxX = Math.max(0, window.innerWidth - widgetWidth);
    const maxY = Math.max(64, window.innerHeight - widgetHeight - safeBottomOffset());
    x.set(Math.min(maxX, Math.max(0, session.originX + deltaX)));
    y.set(Math.min(maxY, Math.max(64, session.originY + deltaY)));
  }

  function finishCharacterPointer(event: PointerEvent | null, cancelled: boolean) {
    const session = characterPointerRef.current;
    if (!session || (event && event.pointerId !== session.pointerId)) return;
    cancelCharacterVoiceTimer();
    cleanupCharacterPointerListeners();
    characterPointerRef.current = null;
    try {
      if (session.target.hasPointerCapture(session.pointerId)) session.target.releasePointerCapture(session.pointerId);
    } catch {
      // Document listeners already guarantee cleanup if pointer capture is unavailable.
    }

    if (session.dragging) {
      suppressCharacterClickRef.current = true;
      finishDraggedPosition();
      return;
    }
    if (session.voiceStarted) {
      suppressCharacterClickRef.current = true;
      characterVoiceLongPressRef.current = false;
      if (cancelled) {
        cancelRecognition("语音输入已取消，可继续使用文字提问。");
      } else {
        recognitionRef.current?.stop();
        setVoiceMessage("正在整理转写文字并准备提交问题。");
      }
      window.setTimeout(() => { suppressCharacterClickRef.current = false; }, 0);
      return;
    }
    if (cancelled) {
      suppressCharacterClickRef.current = true;
      window.setTimeout(() => { suppressCharacterClickRef.current = false; }, 0);
    }
  }

  function minimizeToEdge() {
    stopAllVoiceActivity("禅小荔已收至屏幕边缘，语音活动已停止。");
    const dock: ChanxiaoliDock = x.get() + widgetWidth / 2 < window.innerWidth / 2 ? "left" : "right";
    const currentX = Math.min(Math.max(x.get(), 0), Math.max(0, window.innerWidth - widgetWidth));
    persistPosition(currentX, y.get(), dock);
    x.set(dock === "left" ? -widgetWidth + edgeReveal : window.innerWidth - edgeReveal);
    setPanelOpen(false);
    setVisualState("resting");
  }

  function restoreFromEdge() {
    const nextX = data.dock === "left" ? 12 : Math.max(12, window.innerWidth - widgetWidth - 12);
    const nextY = Math.min(
      Math.max(64, y.get()),
      Math.max(64, window.innerHeight - widgetHeight - safeBottomOffset()),
    );
    x.set(nextX);
    y.set(nextY);
    persistPosition(nextX, nextY, "none");
    setAnchorHorizontal(data.dock === "left" ? "left" : "right");
    setTemporaryVisualState("greeting");
  }

  function beginCharacterInteraction(event: ReactPointerEvent<HTMLButtonElement>) {
    if (data.dock !== "none") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cleanupCharacterPointerListeners();
    characterVoiceLongPressRef.current = false;
    suppressCharacterClickRef.current = false;
    draggingRef.current = false;
    const session: CharacterPointerSession = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      target: event.currentTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: x.get(),
      originY: y.get(),
      dragging: false,
      voiceStarted: false,
    };
    characterPointerRef.current = session;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Document listeners provide the fallback path.
    }
    const pointerUp = (pointerEvent: PointerEvent) => finishCharacterPointer(pointerEvent, false);
    const pointerCancel = (pointerEvent: PointerEvent) => finishCharacterPointer(pointerEvent, true);
    const windowBlur = () => finishCharacterPointer(null, true);
    document.addEventListener("pointermove", handleCharacterPointerMove, { passive: false });
    document.addEventListener("pointerup", pointerUp);
    document.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("blur", windowBlur);
    characterPointerCleanupRef.current = () => {
      document.removeEventListener("pointermove", handleCharacterPointerMove);
      document.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("blur", windowBlur);
    };
    if (characterVoiceTimerRef.current !== null) window.clearTimeout(characterVoiceTimerRef.current);
    characterVoiceTimerRef.current = window.setTimeout(() => {
      if (characterPointerRef.current !== session || session.dragging) return;
      session.voiceStarted = true;
      characterVoiceLongPressRef.current = true;
      suppressCharacterClickRef.current = true;
      setPanelOpen(true);
      stopSpeaking("正在切换到语音输入。");
      startVoiceRecognition();
    }, CHANXIAOLI_LONG_PRESS_MS);
  }

  function cancelCharacterVoiceTimer() {
    if (characterVoiceTimerRef.current !== null) window.clearTimeout(characterVoiceTimerRef.current);
    characterVoiceTimerRef.current = null;
  }

  function speechRecognitionConstructor() {
    const speechWindow = window as WindowWithSpeechRecognition;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }

  function startVoiceRecognition() {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus("unsupported");
      setVoiceMessage("当前浏览器不支持按住说话，请继续使用文字输入。");
      setTemporaryVisualState("pointing");
      return;
    }

    recognitionShouldSubmitRef.current = false;
    const previousRecognition = recognitionRef.current;
    recognitionRef.current = null;
    previousRecognition?.abort();
    voiceTranscriptRef.current = "";
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const normalized = transcript.trim().slice(0, 240);
      if (normalized) {
        voiceTranscriptRef.current = normalized;
        setQuestion(normalized);
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionShouldSubmitRef.current = false;
      const denied = ["not-allowed", "service-not-allowed"].includes(event.error);
      setVoiceStatus(denied ? "denied" : "error");
      setVoiceMessage(denied
        ? "麦克风未授权。本站不会绕过权限，你仍可使用文字输入。"
        : "浏览器没有完成语音转写，请继续使用文字输入。");
      setTemporaryVisualState("pointing");
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      const shouldSubmit = recognitionShouldSubmitRef.current;
      const transcript = voiceTranscriptRef.current.trim();
      recognitionShouldSubmitRef.current = false;
      voiceTranscriptRef.current = "";
      if (shouldSubmit && transcript.length >= 2) {
        setVoiceStatus("idle");
        setVoiceMessage("已识别语音，正在提交转写文字并核对资料。");
        void askGuide(transcript, true);
        return;
      }
      setVoiceStatus((current) => current === "listening" ? "idle" : current);
      setVoiceMessage((current) => current.includes("浏览器") || current.includes("麦克风")
        ? current
        : "没有识别到可提交的问题，请重试或改用文字输入。");
      setTemporaryVisualState("greeting", "greeting");
    };
    recognitionRef.current = recognition;
    recognitionShouldSubmitRef.current = true;
    try {
      recognition.start();
      setVoiceStatus("listening");
      setVoiceMessage("正在听，松开后会提交转写文字。语音识别由浏览器提供，不是服务端实时通话。");
      setVisualState("listening");
    } catch {
      recognitionRef.current = null;
      recognitionShouldSubmitRef.current = false;
      setVoiceStatus("error");
      setVoiceMessage("浏览器没有启动语音转写，请继续使用文字输入。");
      setTemporaryVisualState("pointing");
    }
  }

  function beginVoiceHold() {
    if (status === "loading") return;
    stopSpeaking("正在切换到语音输入。");
    voiceLongPressRef.current = false;
    setVoiceStatus("waiting");
    setVoiceMessage("继续按住即可说话；浏览器可能弹出麦克风权限请求。松开后将提交转写文字。");
    if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = window.setTimeout(() => {
      voiceLongPressRef.current = true;
      startVoiceRecognition();
    }, 520);
  }

  function endVoiceHold() {
    if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = null;
    if (!voiceLongPressRef.current) {
      setVoiceStatus("idle");
      setVoiceMessage("请按住约半秒后说话；也可直接使用文字输入。");
      return;
    }
    recognitionRef.current?.stop();
    setVoiceMessage("正在整理转写文字并准备提交问题。");
  }

  function handleVoiceKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    stopSpeaking("正在切换到语音输入。");
    voiceLongPressRef.current = true;
    startVoiceRecognition();
  }

  function handleVoiceKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    recognitionRef.current?.stop();
  }

  async function askGuide(nextQuestion: string, readAloud = false) {
    const normalized = nextQuestion.trim();
    if (normalized.length < 2) {
      setStatus("error");
      setErrorMessage("请至少输入 2 个字符。");
      setTemporaryVisualState("pointing");
      return;
    }
    const requestedSpeechSequence = speechSequenceRef.current;
    setQuestion(normalized);
    setStatus("loading");
    setErrorMessage("");
    setLatestAnswer(null);
    setVisualState("thinking");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: normalized, allowRemote: false }),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("导游服务没有返回可校验的回答。");
      }
      if (!response.ok || isGuideError(payload)) throw new Error(responseMessage(payload));
      const parsed = parseAIGuideAnswer(payload);
      if (!parsed) throw new Error("回答的事实类型或来源没有通过校验，已停止展示。");
      setVisualState("answering");
      setLatestAnswer(parsed);
      setStatus("idle");
      const item = createChanxiaoliHistoryItem(normalized, parsed);
      setData((current) => ({ ...current, history: appendChanxiaoliHistory(current.history, item) }));
      if (readAloud && requestedSpeechSequence === speechSequenceRef.current) speakAnswer(parsed);
      window.setTimeout(() => setTemporaryVisualState(parsed.refused ? "pointing" : "success", "greeting"), reduceMotion ? 0 : 240);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "禅小荔暂时无法回答。");
      setTemporaryVisualState("pointing");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    stopSpeaking("正在核对新的文字问题。");
    void askGuide(question);
  }

  function toggleMute() {
    if (accessibilityPreferences.muted) {
      setVoiceMessage("全局静音正在生效，请先从“显示与辅助”取消静音。");
      return;
    }
    if (!data.muted) {
      stopSpeaking("禅小荔已静音，当前朗读已停止。");
      updateData({ muted: true });
      setVoiceMessage("禅小荔已静音并保存在这台设备。");
      return;
    }
    updateData({ muted: false });
    setVoiceMessage("已取消静音。语音提问得到回答后，浏览器会自动朗读。");
  }

  function speakAnswer(answer: AIGuideAnswer) {
    if (effectiveMuted) {
      setVoiceMessage(accessibilityPreferences.muted
        ? "全局静音正在生效，请先从“显示与辅助”取消静音。"
        : "禅小荔当前已静音，取消静音后再主动播放。");
      return;
    }
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceMessage("当前浏览器不支持朗读，请阅读文字回答。");
      return;
    }
    try {
      speechSequenceRef.current += 1;
      const sequence = speechSequenceRef.current;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(answer.answer);
      utterance.lang = "zh-CN";
      utterance.rate = 0.95;
      utterance.onstart = () => {
        if (sequence !== speechSequenceRef.current) return;
        setVoiceStatus("speaking");
        setVoiceMessage("正在说。回答由浏览器 speechSynthesis 朗读，不是服务端实时语音。");
        setVisualState("answering");
      };
      utterance.onend = () => {
        if (sequence !== speechSequenceRef.current) return;
        utteranceRef.current = null;
        setVoiceStatus("idle");
        setVoiceMessage("回答已读完，可继续使用文字或语音提问。");
        setTemporaryVisualState("success", "greeting");
      };
      utterance.onerror = (event) => {
        if (sequence !== speechSequenceRef.current) return;
        utteranceRef.current = null;
        setVoiceStatus(event.error === "canceled" || event.error === "interrupted" ? "idle" : "error");
        setVoiceMessage(event.error === "canceled" || event.error === "interrupted"
          ? "朗读已停止，可直接阅读文字回答。"
          : "浏览器没有完成朗读，请阅读文字回答。");
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setVoiceStatus("speaking");
      setVoiceMessage("正在说。回答由浏览器 speechSynthesis 朗读，不是服务端实时语音。");
      setVisualState("answering");
    } catch {
      utteranceRef.current = null;
      setVoiceStatus("error");
      setVoiceMessage("浏览器没有启动朗读，请阅读文字回答。");
    }
  }

  function speakLatestAnswer() {
    if (!latestAnswer) return;
    if (voiceStatus === "speaking") {
      stopSpeaking();
      return;
    }
    speakAnswer(latestAnswer);
  }

  function closeAssistantPanel() {
    stopAllVoiceActivity("问答已收起，语音活动已停止。");
    setPanelOpen(false);
    setVisualState("resting");
  }

  function clearHistory() {
    updateData({ history: [] });
    setLatestAnswer(null);
    setStorageMessage("禅小荔的本机问答历史已清除。");
  }

  if (hiddenPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <>
      <motion.aside
        ref={widgetRef}
        style={{ x, y }}
        className={`pointer-events-auto fixed left-0 top-0 [z-index:var(--z-assistant)] w-[6.75rem] select-none ${hydrated ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-label="禅小荔数字向导"
        data-chanxiaoli-state={visualState}
      >
        <AnimatePresence>
          {panelOpen && data.dock === "none" ? (
            <motion.section
              key="panel"
              initial={reduceMotion ? false : { opacity: 0, y: anchorVertical === "above" ? 10 : -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`absolute w-[min(21.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.7rem] border border-white/75 bg-[#fffaf0]/97 text-[#173f35] shadow-[0_24px_70px_rgba(18,50,40,.24)] backdrop-blur-xl ${anchorHorizontal === "left" ? "left-0" : "right-0"} ${anchorVertical === "above" ? "bottom-[7.1rem]" : "top-[7.1rem]"}`}
              aria-label="与禅小荔问答"
              data-chanxiaoli-panel
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#173f35]/10 bg-[#e8eee7] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ChatCenteredText size={18} weight="duotone" aria-hidden="true" />
                    问问禅小荔
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-[#68766f]">默认只查已登记知识，不发送连续位置或本机旅程</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => { stopAllVoiceActivity("已打开问答历史，语音活动已停止。"); setPanelOpen(false); setHistoryOpen(true); setVisualState("reading"); }} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#52675e] hover:bg-white/70" aria-label="查看禅小荔问答历史"><ClockCounterClockwise size={18} /></button>
                  <button type="button" onClick={minimizeToEdge} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#52675e] hover:bg-white/70" aria-label="把禅小荔收至屏幕边缘"><Minus size={18} /></button>
                  <button type="button" onClick={closeAssistantPanel} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#52675e] hover:bg-white/70" aria-label="收起禅小荔问答"><X size={18} /></button>
                </div>
              </div>

              <div className="max-h-[min(33rem,66dvh)] overflow-y-auto px-4 py-4">
                <form onSubmit={handleSubmit}>
                  <label htmlFor={inputId} className="sr-only">向禅小荔提问</label>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <textarea
                      id={inputId}
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      rows={2}
                      maxLength={240}
                      placeholder="问文化、路线边界或当前能力"
                      className="min-h-20 w-full resize-none rounded-[1.15rem] border border-[#173f35]/15 bg-white/75 px-3 py-2.5 text-base leading-6 outline-none placeholder:text-[#879089] focus:border-[#9b7a42]"
                    />
                    <button type="submit" disabled={status === "loading"} className="grid min-h-12 min-w-12 place-items-center rounded-full bg-[#173f35] text-white disabled:cursor-wait disabled:opacity-50" aria-label="发送问题"><ArrowUp size={19} weight="bold" /></button>
                  </div>
                </form>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onPointerDown={beginVoiceHold}
                    onPointerUp={endVoiceHold}
                    onPointerCancel={endVoiceHold}
                    onPointerLeave={() => { if (voiceStatus === "waiting" || voiceStatus === "listening") endVoiceHold(); }}
                    onKeyDown={handleVoiceKeyDown}
                    onKeyUp={handleVoiceKeyUp}
                    onContextMenu={(event) => event.preventDefault()}
                    className={`inline-flex min-h-11 touch-none items-center gap-2 rounded-full border px-3 text-xs font-semibold ${voiceStatus === "listening" ? "border-[#9b453c]/35 bg-[#f8e5dd] text-[#893f36]" : "border-[#173f35]/14 bg-white/65 text-[#486158]"}`}
                    aria-pressed={voiceStatus === "listening"}
                    aria-label="按住说话，键盘用户按住空格或回车"
                  >
                    {voiceStatus === "denied" || voiceStatus === "unsupported" ? <Microphone size={17} weight="duotone" /> : <Microphone size={17} weight={voiceStatus === "listening" ? "fill" : "duotone"} />}
                    {voiceStatus === "listening" ? "松开结束" : "按住说话"}
                  </button>
                  <button type="button" onClick={toggleMute} disabled={accessibilityPreferences.muted} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#52675e] disabled:opacity-55" aria-pressed={effectiveMuted}>
                    {effectiveMuted ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}
                    {accessibilityPreferences.muted ? "全局静音" : data.muted ? "取消静音" : "静音"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#747f78]" aria-live="polite" data-voice-status={voiceStatus}>{voiceMessage}</p>

                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="推荐问题">
                  {suggestions.map((suggestion, index) => (
                    <button key={suggestion} type="button" onClick={() => { setQuestion(suggestion); setVisualState(index === 1 ? "route" : index === 2 ? "pointing" : "reading"); }} className="rounded-full border border-[#173f35]/10 bg-[#f2e8d8] px-2.5 py-1.5 text-left text-[11px] leading-4 text-[#5b695f] hover:border-[#9b7a42]/45">{suggestion}</button>
                  ))}
                </div>

                <div className="mt-4" aria-live="polite" aria-busy={status === "loading"}>
                  {status === "loading" ? (
                    <div data-chat-typing className="rounded-[1.15rem] border border-[#173f35]/10 bg-[#eef2eb] p-3 text-sm text-[#52675e]">
                      <p className="font-semibold">正在核对已登记知识</p>
                      <div className="mt-3 space-y-2" aria-hidden="true"><div className="h-2.5 w-full animate-pulse rounded-full bg-[#d6dfd5] motion-reduce:animate-none" /><div className="h-2.5 w-4/5 animate-pulse rounded-full bg-[#d6dfd5] motion-reduce:animate-none" /></div>
                    </div>
                  ) : null}
                  {status === "error" ? (
                    <div data-chat-error className="rounded-[1.15rem] border border-[#9b453c]/18 bg-[#faeae2] p-3 text-sm leading-6 text-[#7c3f38]" role="alert"><span className="flex items-center gap-2 font-semibold"><WarningCircle size={18} />暂时没得到可展示回答</span><p className="mt-1">{errorMessage}</p></div>
                  ) : null}
                  {status === "idle" && latestAnswer ? (
                    <article data-chat-bubble className="rounded-[1.15rem] border border-[#173f35]/10 bg-[#f2eee4] p-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#896a39]">{latestAnswer.refused ? "证据不足，已拒答" : "有出处的回答"}</span><button type="button" onClick={speakLatestAnswer} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#496158]" aria-label={voiceStatus === "speaking" ? "停止朗读" : "朗读这条回答"}>{voiceStatus === "speaking" ? <StopCircle size={18} weight="fill" /> : <SpeakerHigh size={17} />}</button></div>
                      <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#36564b]">{latestAnswer.answer}</p>
                      <p className="mt-2 text-[10px] leading-4 text-[#727b74]">{latestAnswer.sources.length} 条来源 · {latestAnswer.notice}</p>
                    </article>
                  ) : null}
                </div>

                <div className="mt-4 border-t border-[#173f35]/10 pt-3 text-[10px] leading-4 text-[#737b75]">
                  <p>问答全文、静音与位置只保存在这台设备；清除浏览器数据后无法恢复。</p>
                  <a href="/guide/ask" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#496158] underline underline-offset-4"><BookOpenText size={15} />打开完整导游与来源卡片</a>
                  {storageMessage ? <p className="mt-2 text-[#8b493e]" role="status">{storageMessage}</p> : null}
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          onPointerDown={beginCharacterInteraction}
          onClick={handleCharacterClick}
          onDoubleClick={handleCharacterDoubleClick}
          // The character is a control, not a draggable image asset. Native
          // image drag cancels Pointer Events after the first move in some
          // browsers, which would leave the character behind the pointer.
          onDragStart={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
          data-chanxiaoli-trigger
          className={`group relative flex h-[8.25rem] w-[6.75rem] cursor-grab touch-none items-end justify-center outline-none active:cursor-grabbing ${data.dock === "left" ? "justify-end" : data.dock === "right" ? "justify-start" : ""}`}
          aria-label={data.dock === "none" ? "禅小荔：单击问答，长按说话，双击历史，可拖动位置" : "恢复禅小荔数字向导"}
          aria-expanded={panelOpen}
          title={data.dock === "none" ? "单击问答 · 长按说话 · 双击历史 · 拖动位置" : "恢复禅小荔"}
        >
          <span className="absolute bottom-1 left-1/2 h-5 w-[72%] -translate-x-1/2 rounded-[50%] bg-[#173f35]/22 blur-[7px]" aria-hidden="true" />
          <span className="absolute inset-x-1 bottom-2 top-6 rounded-[48%] bg-[radial-gradient(circle_at_50%_46%,rgba(255,248,224,.88),rgba(207,224,204,.25)_58%,transparent_72%)]" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={visualState}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, rotate: -2, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative block h-[7.8rem] w-full [filter:drop-shadow(0_12px_12px_rgba(28,56,45,.22))]"
              aria-hidden="true"
            >
              <span className="public-guide-avatar" data-guide-state={visualState} aria-hidden="true">导览</span>
            </motion.span>
          </AnimatePresence>
          {data.dock === "none" ? (
            <span className="absolute bottom-0 right-0 inline-flex min-h-7 items-center gap-1 rounded-full border border-white/75 bg-[#fffaf0]/94 px-2 text-[9px] font-semibold text-[#426054] shadow-sm"><DotsSixVertical size={12} />{visualStateLabel(visualState)}</span>
          ) : (
            <span className={`absolute top-1/2 inline-flex min-h-11 -translate-y-1/2 items-center bg-[#173f35] px-2 text-[10px] font-semibold text-white shadow-lg ${data.dock === "left" ? "right-0 rounded-r-full" : "left-0 rounded-l-full"}`}>恢复</span>
          )}
        </button>
      </motion.aside>

      {historyOpen ? (
        <AccessibleDialog onClose={() => { stopAllVoiceActivity("问答历史已关闭，语音活动已停止。"); setHistoryOpen(false); setVisualState("resting"); }} labelledBy="chanxiaoli-history-title" describedBy="chanxiaoli-history-description" className="m-auto w-[min(92vw,40rem)] rounded-[2rem]">
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#896a39]">On this device</p><h2 id="chanxiaoli-history-title" className="cultural-chanqu mt-2 text-2xl">禅小荔问答历史</h2><p id="chanxiaoli-history-description" className="mt-2 text-sm leading-6 text-[#607169]">最多保留最近 24 条问答全文与来源名称，仅在这台设备的浏览器中。它不会自动同步到游客账号。</p></div>
              <button type="button" onClick={() => { stopAllVoiceActivity("问答历史已关闭，语音活动已停止。"); setHistoryOpen(false); setVisualState("resting"); }} className="grid min-h-12 min-w-12 place-items-center rounded-full border border-[#173f35]/14" aria-label="关闭问答历史"><X size={20} /></button>
            </div>
            {data.history.length ? (
              <ol className="mt-6 max-h-[56dvh] divide-y divide-[#173f35]/10 overflow-y-auto border-y border-[#173f35]/10">
                {[...data.history].reverse().map((item) => (
                  <li key={item.id} className="py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">你问：{item.question}</strong><time className="text-[10px] text-[#7d857f]" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#52685f]">{item.answer}</p>
                    <p className="mt-2 text-[10px] leading-5 text-[#7b7469]">{item.refused ? "证据不足，已拒答" : item.sourceLabels.join(" · ")}</p>
                  </li>
                ))}
              </ol>
            ) : <div className="mt-7 rounded-[1.4rem] border border-dashed border-[#173f35]/18 px-5 py-10 text-center text-sm text-[#63736b]">这里还没有问答。单击禅小荔即可开始。</div>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-[#6d786f]">禅小荔 · 你的智能云游向导</p>
              <button type="button" onClick={clearHistory} disabled={!data.history.length} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#9b453c]/20 px-4 text-xs font-semibold text-[#81453d] disabled:opacity-45"><Trash size={16} />清除本机问答历史</button>
            </div>
          </div>
        </AccessibleDialog>
      ) : null}
    </>
  );
}
