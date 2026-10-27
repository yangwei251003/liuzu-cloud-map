import type { AIGuideAnswer } from "./ai-guide/types";

export const CHANXIAOLI_STORAGE_KEY = "liuzu-cloud-tour:chanxiaoli-assistant:v1";
export const CHANXIAOLI_HISTORY_LIMIT = 24;
export const CHANXIAOLI_LONG_PRESS_MS = 560;

export function classifyChanxiaoliPointerIntent({
  durationMs,
  movementPx,
}: {
  durationMs: number;
  movementPx: number;
}) {
  if (movementPx >= 8) return "drag" as const;
  if (durationMs >= CHANXIAOLI_LONG_PRESS_MS) return "voice" as const;
  return "click" as const;
}

export type ChanxiaoliDock = "none" | "left" | "right";
export type ChanxiaoliVisualState =
  | "resting"
  | "greeting"
  | "listening"
  | "thinking"
  | "answering"
  | "success"
  | "route"
  | "pointing"
  | "walking"
  | "reading";

export type ChanxiaoliHistoryItem = {
  id: string;
  question: string;
  answer: string;
  sourceLabels: string[];
  refused: boolean;
  createdAt: string;
};

export type ChanxiaoliAssistantData = {
  version: 1;
  position: {
    xRatio: number;
    yRatio: number;
  } | null;
  dock: ChanxiaoliDock;
  muted: boolean;
  history: ChanxiaoliHistoryItem[];
};

export const DEFAULT_CHANXIAOLI_DATA: ChanxiaoliAssistantData = {
  version: 1,
  position: null,
  dock: "none",
  muted: false,
  history: [],
};

export const CHANXIAOLI_ASSETS: Record<ChanxiaoliVisualState, string> = {
  resting: "/assets/chanxiaoli/v1/resting.webp",
  greeting: "/assets/chanxiaoli/v1/greeting.webp",
  listening: "/assets/chanxiaoli/v1/listening.webp",
  thinking: "/assets/chanxiaoli/v1/thinking.webp",
  answering: "/assets/chanxiaoli/v1/answering.webp",
  success: "/assets/chanxiaoli/v1/success.webp",
  route: "/assets/chanxiaoli/v1/route.webp",
  pointing: "/assets/chanxiaoli/v1/pointing.webp",
  walking: "/assets/chanxiaoli/v1/walking.webp",
  reading: "/assets/chanxiaoli/v1/reading.webp",
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function clampText(value: string, limit: number) {
  return value.trim().slice(0, limit);
}

function parseHistoryItem(value: unknown): ChanxiaoliHistoryItem | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["id", "question", "answer", "sourceLabels", "refused", "createdAt"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.question !== "string" ||
    typeof value.answer !== "string" ||
    !Array.isArray(value.sourceLabels) ||
    !value.sourceLabels.every((label) => typeof label === "string") ||
    typeof value.refused !== "boolean" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(new Date(value.createdAt).getTime())
  ) return null;

  const id = clampText(value.id, 80);
  const question = clampText(value.question, 240);
  const answer = clampText(value.answer, 2_400);
  const sourceLabels = value.sourceLabels
    .map((label) => clampText(label, 120))
    .filter(Boolean)
    .slice(0, 8);
  if (!id || question.length < 2 || !answer) return null;
  return { id, question, answer, sourceLabels, refused: value.refused, createdAt: value.createdAt };
}

export function parseChanxiaoliAssistantData(value: unknown): ChanxiaoliAssistantData | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["version", "position", "dock", "muted", "history"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (
    value.version !== 1 ||
    !["none", "left", "right"].includes(String(value.dock)) ||
    typeof value.muted !== "boolean" ||
    !Array.isArray(value.history)
  ) return null;

  let position: ChanxiaoliAssistantData["position"] = null;
  if (value.position !== null) {
    if (!isRecord(value.position)) return null;
    const positionKeys = Object.keys(value.position);
    if (
      positionKeys.some((key) => key !== "xRatio" && key !== "yRatio") ||
      !isFiniteRatio(value.position.xRatio) ||
      !isFiniteRatio(value.position.yRatio)
    ) return null;
    position = { xRatio: value.position.xRatio, yRatio: value.position.yRatio };
  }

  const history = value.history
    .map(parseHistoryItem)
    .filter((item): item is ChanxiaoliHistoryItem => item !== null)
    .slice(-CHANXIAOLI_HISTORY_LIMIT);

  return {
    version: 1,
    position,
    dock: value.dock as ChanxiaoliDock,
    muted: value.muted,
    history,
  };
}

export function readChanxiaoliAssistantData(storage: StorageReader | null = null) {
  if (!storage) return { data: DEFAULT_CHANXIAOLI_DATA, error: null as string | null };
  try {
    const raw = storage.getItem(CHANXIAOLI_STORAGE_KEY);
    if (!raw) return { data: DEFAULT_CHANXIAOLI_DATA, error: null as string | null };
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { data: DEFAULT_CHANXIAOLI_DATA, error: "禅小荔的本机记录已损坏，已安全恢复默认值。" };
    }
    const parsed = parseChanxiaoliAssistantData(decoded);
    if (!parsed) return { data: DEFAULT_CHANXIAOLI_DATA, error: "禅小荔的本机记录已损坏，已安全恢复默认值。" };
    return { data: parsed, error: null as string | null };
  } catch {
    return { data: DEFAULT_CHANXIAOLI_DATA, error: "浏览器阻止读取禅小荔的本机记录，本次仍可继续使用。" };
  }
}

export function writeChanxiaoliAssistantData(
  value: ChanxiaoliAssistantData,
  storage: StorageWriter | null = null,
) {
  const parsed = parseChanxiaoliAssistantData(value);
  if (!parsed || !storage) return false;
  try {
    storage.setItem(CHANXIAOLI_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function createChanxiaoliHistoryItem(
  question: string,
  answer: AIGuideAnswer,
  now = new Date(),
): ChanxiaoliHistoryItem {
  return {
    id: answer.requestId,
    question: clampText(question, 240),
    answer: clampText(answer.answer, 2_400),
    sourceLabels: answer.sources.map((source) => `[${source.id}] ${source.title}`).slice(0, 8),
    refused: answer.refused,
    createdAt: Number.isNaN(now.getTime()) ? new Date(0).toISOString() : now.toISOString(),
  };
}

export function appendChanxiaoliHistory(
  history: ChanxiaoliHistoryItem[],
  item: ChanxiaoliHistoryItem,
) {
  const deduplicated = history.filter((candidate) => candidate.id !== item.id);
  return [...deduplicated, item].slice(-CHANXIAOLI_HISTORY_LIMIT);
}

export function normalizeAssistantPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  widgetWidth: number,
  widgetHeight: number,
) {
  const rangeX = Math.max(1, viewportWidth - widgetWidth);
  const rangeY = Math.max(1, viewportHeight - widgetHeight);
  return {
    xRatio: Math.min(1, Math.max(0, x / rangeX)),
    yRatio: Math.min(1, Math.max(0, y / rangeY)),
  };
}

export function denormalizeAssistantPosition(
  position: NonNullable<ChanxiaoliAssistantData["position"]>,
  viewportWidth: number,
  viewportHeight: number,
  widgetWidth: number,
  widgetHeight: number,
) {
  return {
    x: position.xRatio * Math.max(1, viewportWidth - widgetWidth),
    y: position.yRatio * Math.max(1, viewportHeight - widgetHeight),
  };
}
