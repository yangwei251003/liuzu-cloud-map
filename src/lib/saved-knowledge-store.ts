import {
  AI_GUIDE_FACT_TYPES,
  type AIGuideAnswer,
  type AIGuideFactType,
  type AIGuideReviewStatus,
  type AIGuideSourceStatus,
} from "./ai-guide/types";

export const SAVED_KNOWLEDGE_STORAGE_KEY = "liuzu-cloud-tour:saved-knowledge:v1";

export type SavedKnowledgeSourceReference = {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  checkedAt: string;
  factType: AIGuideFactType;
  reviewStatus: AIGuideReviewStatus;
  sourceStatus: AIGuideSourceStatus;
};

export type SavedKnowledgeReference = {
  id: string;
  question: string;
  spotId?: string;
  spotName?: string;
  factTypes: AIGuideFactType[];
  sources: SavedKnowledgeSourceReference[];
  answerGeneratedAt: string;
  savedAt: string;
};

export type SavedKnowledgeData = {
  version: 1;
  items: SavedKnowledgeReference[];
  updatedAt: string | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isIsoDate(value: unknown): value is string {
  return nonEmptyString(value, 40) && !Number.isNaN(new Date(value).getTime());
}

function isFactType(value: unknown): value is AIGuideFactType {
  return typeof value === "string" && (AI_GUIDE_FACT_TYPES as readonly string[]).includes(value);
}

function parseSource(value: unknown): SavedKnowledgeSourceReference | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmptyString(value.id, 120) ||
    !nonEmptyString(value.title, 240) ||
    !nonEmptyString(value.publisher, 160) ||
    (value.url !== undefined && !nonEmptyString(value.url, 1000)) ||
    !isIsoDate(value.checkedAt) ||
    !isFactType(value.factType) ||
    (value.reviewStatus !== "PROJECT_SOURCE_CHECKED" && value.reviewStatus !== "PROJECT_BOUNDARY_ONLY") ||
    (value.sourceStatus !== "OFFICIAL_PRIMARY" && value.sourceStatus !== "PROJECT_INTERNAL")
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    publisher: value.publisher,
    ...(value.url ? { url: value.url } : {}),
    checkedAt: value.checkedAt,
    factType: value.factType,
    reviewStatus: value.reviewStatus,
    sourceStatus: value.sourceStatus,
  };
}

function parseReference(value: unknown): SavedKnowledgeReference | null {
  if (!isRecord(value) || !Array.isArray(value.factTypes) || !Array.isArray(value.sources)) return null;
  const sources = value.sources.map(parseSource);
  if (
    !nonEmptyString(value.id, 160) ||
    !nonEmptyString(value.question, 240) ||
    (value.spotId !== undefined && !nonEmptyString(value.spotId, 120)) ||
    (value.spotName !== undefined && !nonEmptyString(value.spotName, 160)) ||
    value.factTypes.length === 0 ||
    !value.factTypes.every(isFactType) ||
    new Set(value.factTypes).size !== value.factTypes.length ||
    sources.length === 0 ||
    sources.length > 20 ||
    sources.some((source) => source === null) ||
    !isIsoDate(value.answerGeneratedAt) ||
    !isIsoDate(value.savedAt)
  ) {
    return null;
  }
  return {
    id: value.id,
    question: value.question,
    ...(value.spotId ? { spotId: value.spotId } : {}),
    ...(value.spotName ? { spotName: value.spotName } : {}),
    factTypes: [...value.factTypes] as AIGuideFactType[],
    sources: sources as SavedKnowledgeSourceReference[],
    answerGeneratedAt: value.answerGeneratedAt,
    savedAt: value.savedAt,
  };
}

export function createEmptySavedKnowledgeData(): SavedKnowledgeData {
  return { version: 1, items: [], updatedAt: null };
}

export function parseSavedKnowledgeData(value: unknown): SavedKnowledgeData | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.items)) return null;
  if (value.items.length > 100 || (value.updatedAt !== null && !isIsoDate(value.updatedAt))) return null;
  const items = value.items.map(parseReference);
  if (items.some((item) => item === null)) return null;
  const parsedItems = items as SavedKnowledgeReference[];
  if (new Set(parsedItems.map((item) => item.id)).size !== parsedItems.length) return null;
  return { version: 1, items: parsedItems, updatedAt: value.updatedAt as string | null };
}

export function readSavedKnowledgeData(): { data: SavedKnowledgeData; error: string | null } {
  if (typeof window === "undefined") return { data: createEmptySavedKnowledgeData(), error: null };
  try {
    const raw = window.localStorage.getItem(SAVED_KNOWLEDGE_STORAGE_KEY);
    if (!raw) return { data: createEmptySavedKnowledgeData(), error: null };
    const parsed = parseSavedKnowledgeData(JSON.parse(raw));
    return parsed
      ? { data: parsed, error: null }
      : { data: createEmptySavedKnowledgeData(), error: "知识卡数据格式异常，未读取不可信内容。" };
  } catch {
    return { data: createEmptySavedKnowledgeData(), error: "浏览器未能读取知识卡。" };
  }
}

function writeSavedKnowledgeData(data: SavedKnowledgeData): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: false, error: "当前环境不能保存知识卡。" };
  const parsed = parseSavedKnowledgeData(data);
  if (!parsed) return { ok: false, error: "知识卡内容未通过格式校验。" };
  try {
    window.localStorage.setItem(SAVED_KNOWLEDGE_STORAGE_KEY, JSON.stringify(parsed));
    return { ok: true };
  } catch {
    return { ok: false, error: "浏览器存储空间不可用，知识卡没有保存。" };
  }
}

function makeReferenceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `knowledge-${crypto.randomUUID()}`;
  return `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveKnowledgeReference(input: {
  question: string;
  answer: AIGuideAnswer;
  spotId?: string;
  spotName?: string;
}): { ok: true; item: SavedKnowledgeReference; duplicate: boolean } | { ok: false; error: string } {
  const question = input.question.trim();
  if (!question || question.length > 240) return { ok: false, error: "知识卡问题为空或过长。" };
  if (input.answer.refused || input.answer.factTypes.length === 0 || input.answer.sources.length === 0) {
    return { ok: false, error: "拒答或无来源回答不能保存为知识卡。" };
  }
  const current = readSavedKnowledgeData();
  if (current.error) return { ok: false, error: current.error };
  const sourceSignature = input.answer.sources.map((source) => source.id).sort().join("|");
  const duplicate = current.data.items.find(
    (item) => item.question === question && (item.spotId ?? "") === (input.spotId ?? "") && item.sources.map((source) => source.id).sort().join("|") === sourceSignature,
  );
  if (duplicate) return { ok: true, item: duplicate, duplicate: true };
  if (current.data.items.length >= 100) return { ok: false, error: "这台设备最多保存 100 张知识卡，请先删除旧卡片。" };
  const now = new Date().toISOString();
  const item: SavedKnowledgeReference = {
    id: makeReferenceId(),
    question,
    ...(input.spotId ? { spotId: input.spotId } : {}),
    ...(input.spotName ? { spotName: input.spotName } : {}),
    factTypes: [...input.answer.factTypes],
    sources: input.answer.sources.map((source) => ({
      id: source.id,
      title: source.title,
      publisher: source.publisher,
      ...(source.url ? { url: source.url } : {}),
      checkedAt: source.checkedAt,
      factType: source.factType,
      reviewStatus: source.reviewStatus,
      sourceStatus: source.sourceStatus,
    })),
    answerGeneratedAt: input.answer.generatedAt,
    savedAt: now,
  };
  const next = { version: 1 as const, items: [item, ...current.data.items], updatedAt: now };
  const write = writeSavedKnowledgeData(next);
  return write.ok ? { ok: true, item, duplicate: false } : write;
}

export function deleteKnowledgeReference(id: string): { ok: true } | { ok: false; error: string } {
  const current = readSavedKnowledgeData();
  if (current.error) return { ok: false, error: current.error };
  if (!current.data.items.some((item) => item.id === id)) return { ok: false, error: "没有找到这张知识卡。" };
  const now = new Date().toISOString();
  return writeSavedKnowledgeData({ version: 1, items: current.data.items.filter((item) => item.id !== id), updatedAt: now });
}
