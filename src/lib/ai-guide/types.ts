export const AI_GUIDE_FACT_TYPES = [
  "official_current",
  "historical_record",
  "religious_tradition",
  "local_legend",
  "interpretation",
  "marketing_claim",
  "ugc_experience",
  "realtime_status",
] as const;

export type AIGuideFactType = (typeof AI_GUIDE_FACT_TYPES)[number];
export type AIGuideEvidenceLevel = "A" | "PROJECT";
export type AIGuideReviewStatus = "PROJECT_SOURCE_CHECKED" | "PROJECT_BOUNDARY_ONLY";
export type AIGuideSourceStatus = "OFFICIAL_PRIMARY" | "PROJECT_INTERNAL";

export const AI_GUIDE_FACT_TYPE_LABELS: Record<AIGuideFactType, string> = {
  official_current: "官方现行介绍",
  historical_record: "史实 / 文保记录",
  religious_tradition: "宗教传统",
  local_legend: "地方传说",
  interpretation: "解释 / 创作内容",
  marketing_claim: "营销表述",
  ugc_experience: "游客体验",
  realtime_status: "运营动态",
};

export const AI_GUIDE_REVIEW_STATUS_LABELS: Record<AIGuideReviewStatus, string> = {
  PROJECT_SOURCE_CHECKED: "项目已核对来源 · 未经专业终审",
  PROJECT_BOUNDARY_ONLY: "项目边界记录 · 非景区正式发布",
};

export const AI_GUIDE_SOURCE_STATUS_LABELS: Record<AIGuideSourceStatus, string> = {
  OFFICIAL_PRIMARY: "官方 / 一手来源",
  PROJECT_INTERNAL: "项目内部边界资料",
};

export type AIGuideSource = {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  checkedAt: string;
  evidenceLevel: AIGuideEvidenceLevel;
  factType: AIGuideFactType;
  reviewStatus: AIGuideReviewStatus;
  sourceStatus: AIGuideSourceStatus;
  note?: string;
};

export type AIGuideRequest = {
  question: string;
  spotId?: string;
  allowRemote: boolean;
};

/** A single grounded declaration; its source IDs must be visible in `text`. */
export type GuideAnswerClaim = {
  text: string;
  sourceIds: string[];
  factTypes: AIGuideFactType[];
};

export type AIGuideAnswer = {
  requestId: string;
  answer: string;
  claims: GuideAnswerClaim[];
  factTypes: AIGuideFactType[];
  sources: AIGuideSource[];
  provider: "gemini-assisted" | "local-knowledge";
  verification: "verified-context" | "limited";
  refused: boolean;
  generatedAt: string;
  notice: string;
};

export type AIGuideError = {
  requestId: string;
  error: {
    code: "INVALID_REQUEST" | "RATE_LIMITED" | "SERVER_ERROR";
    message: string;
    retryable: boolean;
  };
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseAIGuideRequest(value: unknown): AIGuideRequest | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["question", "spotId", "allowRemote"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const spotId = typeof value.spotId === "string" ? value.spotId.trim() : undefined;
  if (question.length < 2 || question.length > 240) return null;
  if (spotId && (!/^[a-z0-9-]+$/i.test(spotId) || spotId.length > 64)) return null;
  if (value.allowRemote !== undefined && typeof value.allowRemote !== "boolean") return null;
  return { question, ...(spotId ? { spotId } : {}), allowRemote: value.allowRemote === true };
}

export function isAIGuideFactType(value: unknown): value is AIGuideFactType {
  return typeof value === "string" && (AI_GUIDE_FACT_TYPES as readonly string[]).includes(value);
}

export function isAIGuideSource(value: unknown): value is AIGuideSource {
  if (!isRecord(value)) return false;
  return (
    nonEmptyString(value.id) &&
    nonEmptyString(value.title) &&
    nonEmptyString(value.publisher) &&
    (value.url === undefined || nonEmptyString(value.url)) &&
    nonEmptyString(value.checkedAt) &&
    (value.evidenceLevel === "A" || value.evidenceLevel === "PROJECT") &&
    isAIGuideFactType(value.factType) &&
    (value.reviewStatus === "PROJECT_SOURCE_CHECKED" || value.reviewStatus === "PROJECT_BOUNDARY_ONLY") &&
    (value.sourceStatus === "OFFICIAL_PRIMARY" || value.sourceStatus === "PROJECT_INTERNAL") &&
    (value.note === undefined || nonEmptyString(value.note))
  );
}

function hasVisibleCitation(text: string, sourceId: string) {
  return text.includes(`[${sourceId}]`);
}

export function isGuideAnswerClaim(value: unknown): value is GuideAnswerClaim {
  if (!isRecord(value)) return false;
  const text = value.text;
  const sourceIds = value.sourceIds;
  const factTypes = value.factTypes;
  if (!nonEmptyString(text) || text.length > 800) return false;
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > 8) return false;
  if (!sourceIds.every((sourceId) => nonEmptyString(sourceId) && sourceId.length <= 100)) return false;
  const normalizedSourceIds = sourceIds as string[];
  if (new Set(normalizedSourceIds).size !== normalizedSourceIds.length) return false;
  if (!normalizedSourceIds.every((sourceId) => hasVisibleCitation(text, sourceId))) return false;
  if (!Array.isArray(factTypes) || factTypes.length === 0 || !factTypes.every(isAIGuideFactType)) return false;
  const normalizedFactTypes = factTypes as AIGuideFactType[];
  return new Set(normalizedFactTypes).size === normalizedFactTypes.length;
}

export function parseAIGuideAnswer(value: unknown): AIGuideAnswer | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.requestId) ||
    !nonEmptyString(value.answer) ||
    !Array.isArray(value.claims) ||
    value.claims.length === 0 ||
    value.claims.length > 8 ||
    !value.claims.every(isGuideAnswerClaim) ||
    !Array.isArray(value.factTypes) ||
    !value.factTypes.every(isAIGuideFactType) ||
    new Set(value.factTypes).size !== value.factTypes.length ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every(isAIGuideSource) ||
    (value.provider !== "gemini-assisted" && value.provider !== "local-knowledge") ||
    (value.verification !== "verified-context" && value.verification !== "limited") ||
    typeof value.refused !== "boolean" ||
    !nonEmptyString(value.generatedAt) ||
    Number.isNaN(new Date(value.generatedAt).getTime()) ||
    !nonEmptyString(value.notice)
  ) {
    return null;
  }

  const sources = value.sources as AIGuideSource[];
  if (new Set(sources.map((source) => source.id)).size !== sources.length) return null;
  if (!value.refused && value.factTypes.length === 0) return null;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const sourceFactTypes = new Set(sources.map((source) => source.factType));
  if (!value.refused && (value.factTypes as AIGuideFactType[]).some((factType) => !sourceFactTypes.has(factType))) return null;
  for (const claim of value.claims as GuideAnswerClaim[]) {
    const claimSources = claim.sourceIds.map((id) => sourceById.get(id));
    if (claimSources.some((source) => !source)) return null;
    const claimFactTypes = new Set(claimSources.map((source) => source?.factType));
    if (claim.factTypes.some((factType) => !claimFactTypes.has(factType))) return null;
  }
  return value as AIGuideAnswer;
}
