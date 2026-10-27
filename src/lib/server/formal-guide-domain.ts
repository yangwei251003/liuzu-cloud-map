import type { GuideAnswerClaim } from "../p0-core-types";

export const FORMAL_GUIDE_SCHEMA_VERSION = 1 as const;

const SCENIC_AREA_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_QUESTION_LENGTH = 320;
const MAX_APPROVED_ANSWER_LENGTH = 1_200;
const MAX_SOURCE_REFERENCE_LENGTH = 600;
const MAX_KNOWLEDGE_KEY_LENGTH = 160;
const MAX_IDENTIFIER_LENGTH = 128;

type UnknownRecord = Record<string, unknown>;

export type FormalGuideKnowledgeFactType = "HISTORICAL" | "CULTURAL" | "VISITOR_SERVICE" | "SAFETY" | "OTHER";
export type FormalGuideKnowledgeLifecycleState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "WITHDRAWN" | "EXPIRED";
export type FormalGuideRightsState = "CLEARED" | "PENDING" | "RESTRICTED" | "UNKNOWN";

export type FormalGuideAnswerRequest = Readonly<{
  schemaVersion: typeof FORMAL_GUIDE_SCHEMA_VERSION;
  scenicAreaId: string;
  expectedSnapshotRevision: number;
  question: string;
}>;

/**
 * A server-side row shape. The service validates it again before it ever
 * becomes a visitor-visible fact, so an accidentally broad query fails closed.
 */
export type FormalGuideKnowledgeEntry = Readonly<{
  knowledgeId: string;
  contentVersionId: string;
  contentRevision: number;
  knowledgeKey: string;
  factType: FormalGuideKnowledgeFactType;
  sourceReference: string;
  bodyJson: unknown;
  knowledgeLifecycleState: FormalGuideKnowledgeLifecycleState;
  knowledgeValidUntil: string;
  knowledgeWithdrawnAt: string | null;
  contentLifecycleState: FormalGuideKnowledgeLifecycleState;
  contentValidUntil: string;
  rightsState: FormalGuideRightsState;
  sourceLicenseState: FormalGuideRightsState;
  sourceVerifiedAt: string | null;
  sourceValidUntil: string;
}>;

export type PublishedFormalGuideKnowledgeSnapshot = Readonly<{
  schemaVersion: typeof FORMAL_GUIDE_SCHEMA_VERSION;
  scenicAreaId: string;
  snapshotRevision: number;
  lifecycleState: "PUBLISHED";
  publishedAt: string;
  expiresAt: string;
  entries: readonly FormalGuideKnowledgeEntry[];
}>;

export type FormalGuideKnowledgeRepository = {
  readCurrentPublishedKnowledge(
    scenicAreaId: string,
    expectedSnapshotRevision: number,
  ): Promise<PublishedFormalGuideKnowledgeSnapshot | null>;
};

export type FormalGuideAnswerSource = Readonly<{
  sourceId: string;
  sourceReference: string;
  contentVersionId: string;
  contentRevision: number;
  factType: GuideAnswerClaim["factType"];
}>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= maximum
    && value.trim().length >= minimum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isPositiveRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isFuture(value: string, now: Date) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function isCurrentOrPast(value: string, now: Date) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now.getTime() + 5 * 60_000;
}

export function isFormalGuideScenicAreaId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && SCENIC_AREA_ID_PATTERN.test(value);
}

export function parseFormalGuideAnswerRequest(value: unknown): FormalGuideAnswerRequest | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["schemaVersion", "scenicAreaId", "expectedSnapshotRevision", "question"])
    || value.schemaVersion !== FORMAL_GUIDE_SCHEMA_VERSION
    || !isFormalGuideScenicAreaId(value.scenicAreaId)
    || !isPositiveRevision(value.expectedSnapshotRevision)
    || !isSafeText(value.question, MAX_QUESTION_LENGTH, 2)
  ) {
    return null;
  }
  return {
    schemaVersion: FORMAL_GUIDE_SCHEMA_VERSION,
    scenicAreaId: value.scenicAreaId,
    expectedSnapshotRevision: value.expectedSnapshotRevision,
    question: value.question.trim(),
  };
}

export function formalGuideFactType(factType: FormalGuideKnowledgeFactType): GuideAnswerClaim["factType"] | null {
  if (factType === "HISTORICAL") return "HISTORY";
  if (factType === "CULTURAL") return "CULTURE";
  if (factType === "VISITOR_SERVICE") return "POI";
  if (factType === "SAFETY") return "SAFETY";
  return null;
}

/** The publishing contract reserves body_json.answer for a reviewed factual answer. */
export function approvedKnowledgeAnswer(bodyJson: unknown) {
  if (!isRecord(bodyJson) || !isSafeText(bodyJson.answer, MAX_APPROVED_ANSWER_LENGTH, 2)) return null;
  return bodyJson.answer.trim().replace(/\s+/gu, " ");
}

function isFormalGuideKnowledgeFactType(value: unknown): value is FormalGuideKnowledgeFactType {
  return value === "HISTORICAL" || value === "CULTURAL" || value === "VISITOR_SERVICE" || value === "SAFETY" || value === "OTHER";
}

function isFormalGuideKnowledgeLifecycleState(value: unknown): value is FormalGuideKnowledgeLifecycleState {
  return value === "DRAFT" || value === "IN_REVIEW" || value === "APPROVED" || value === "PUBLISHED" || value === "WITHDRAWN" || value === "EXPIRED";
}

function isFormalGuideRightsState(value: unknown): value is FormalGuideRightsState {
  return value === "CLEARED" || value === "PENDING" || value === "RESTRICTED" || value === "UNKNOWN";
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

export function isFormalGuideKnowledgeEntry(value: unknown): value is FormalGuideKnowledgeEntry {
  if (!isRecord(value) || !hasExactKeys(value, [
    "knowledgeId",
    "contentVersionId",
    "contentRevision",
    "knowledgeKey",
    "factType",
    "sourceReference",
    "bodyJson",
    "knowledgeLifecycleState",
    "knowledgeValidUntil",
    "knowledgeWithdrawnAt",
    "contentLifecycleState",
    "contentValidUntil",
    "rightsState",
    "sourceLicenseState",
    "sourceVerifiedAt",
    "sourceValidUntil",
  ])) {
    return false;
  }
  return (
    typeof value.knowledgeId === "string"
    && typeof value.contentVersionId === "string"
    && typeof value.contentRevision === "number"
    && typeof value.knowledgeKey === "string"
    && isFormalGuideKnowledgeFactType(value.factType)
    && typeof value.sourceReference === "string"
    && isFormalGuideKnowledgeLifecycleState(value.knowledgeLifecycleState)
    && typeof value.knowledgeValidUntil === "string"
    && isTimestampOrNull(value.knowledgeWithdrawnAt)
    && isFormalGuideKnowledgeLifecycleState(value.contentLifecycleState)
    && typeof value.contentValidUntil === "string"
    && isFormalGuideRightsState(value.rightsState)
    && isFormalGuideRightsState(value.sourceLicenseState)
    && isTimestampOrNull(value.sourceVerifiedAt)
    && typeof value.sourceValidUntil === "string"
  );
}

/**
 * Defense in depth for the database query. An entry must remain reviewed,
 * rights-cleared, source-verified and current at answer time.
 */
export function isEligibleFormalGuideKnowledge(entry: FormalGuideKnowledgeEntry, now: Date) {
  if (
    !isSafeText(entry.knowledgeId, MAX_IDENTIFIER_LENGTH)
    || !isSafeText(entry.contentVersionId, MAX_IDENTIFIER_LENGTH)
    || !Number.isSafeInteger(entry.contentRevision)
    || entry.contentRevision < 1
    || !isSafeText(entry.knowledgeKey, MAX_KNOWLEDGE_KEY_LENGTH)
    || !isSafeText(entry.sourceReference, MAX_SOURCE_REFERENCE_LENGTH)
    || !["APPROVED", "PUBLISHED"].includes(entry.knowledgeLifecycleState)
    || !["APPROVED", "PUBLISHED"].includes(entry.contentLifecycleState)
    || entry.knowledgeWithdrawnAt !== null
    || entry.rightsState !== "CLEARED"
    || entry.sourceLicenseState !== "CLEARED"
    || !entry.sourceVerifiedAt
    || !isFuture(entry.knowledgeValidUntil, now)
    || !isFuture(entry.contentValidUntil, now)
    || !isFuture(entry.sourceValidUntil, now)
    || !isCurrentOrPast(entry.sourceVerifiedAt, now)
    || formalGuideFactType(entry.factType) === null
    || approvedKnowledgeAnswer(entry.bodyJson) === null
  ) {
    return false;
  }
  return true;
}

export function isCurrentPublishedFormalGuideSnapshot(
  value: unknown,
  scenicAreaId: string,
  expectedSnapshotRevision: number,
  now: Date,
): value is PublishedFormalGuideKnowledgeSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "scenicAreaId", "snapshotRevision", "lifecycleState", "publishedAt", "expiresAt", "entries"])) {
    return false;
  }
  if (
    value.schemaVersion !== FORMAL_GUIDE_SCHEMA_VERSION
    || value.scenicAreaId !== scenicAreaId
    || !isFormalGuideScenicAreaId(value.scenicAreaId)
    || value.snapshotRevision !== expectedSnapshotRevision
    || !isPositiveRevision(value.snapshotRevision)
    || value.lifecycleState !== "PUBLISHED"
    || !isSafeText(value.publishedAt, 40)
    || !isSafeText(value.expiresAt, 40)
    || !isCurrentOrPast(value.publishedAt, now)
    || !isFuture(value.expiresAt, now)
    || !Array.isArray(value.entries)
    || value.entries.length > 500
    || !value.entries.every(isFormalGuideKnowledgeEntry)
  ) {
    return false;
  }
  return true;
}

export function isStrictFormalGuideClaim(value: unknown): value is GuideAnswerClaim {
  if (!isRecord(value) || !hasExactKeys(value, ["text", "sourceId", "factType"])) return false;
  if (
    !isSafeText(value.text, 800, 2)
    || !isSafeText(value.sourceId, MAX_IDENTIFIER_LENGTH)
    || !["CULTURE", "HISTORY", "POI", "SAFETY", "OPERATIONS"].includes(String(value.factType))
  ) {
    return false;
  }
  return value.text.includes(`[${value.sourceId}]`);
}

const PROMPT_INJECTION_PATTERN = /(?:ignore\s+(?:all\s+)?(?:previous|above|system|instructions?)|system\s*prompt|developer\s*message|jailbreak|<\/?\s*(?:system|instruction|prompt)\b|忽略.{0,24}(?:指令|规则|提示|前文)|无视.{0,24}(?:指令|规则|提示)|越狱|系统提示|开发者消息)/iu;
const DYNAMIC_CONTEXT_PATTERN = /(?:当前|现在|实时|今日|今天|明天|此刻|目前|最新|是否|有没有|能否|可以吗|几点|多久|多少|正在)/u;
const OPERATIONAL_TOPIC_PATTERN = /(?:开放|营业|关闭|封路|道路|路线|导航|入口|出口|停车|排队|客流|人流|拥挤|票价|预约|天气|风险|危险|安全|事故|救援|医务|卫生间|无障碍|通行)/u;
const INHERENTLY_DYNAMIC_PATTERN = /(?:开放时间|票价|封路|路线|导航|实时|客流|排队|停车|紧急|救援|事故|天气)/u;

export function isPromptInjectionAttempt(question: string) {
  return PROMPT_INJECTION_PATTERN.test(question);
}

/** Dynamic operational or safety advice must go through the verified live-operations channel, never RAG. */
export function isDynamicSafetyOrOperationsQuestion(question: string) {
  return (
    INHERENTLY_DYNAMIC_PATTERN.test(question)
    || (DYNAMIC_CONTEXT_PATTERN.test(question) && OPERATIONAL_TOPIC_PATTERN.test(question))
    || (/(?:安全|危险|风险)/u.test(question) && /(?:吗|么|如何|怎样|是否|能否|现在|当前)/u.test(question))
  );
}

/** Chinese bigrams plus normalized word tokens make ranking deterministic without a vector service. */
export function lexicalTokens(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/gu, " ").trim();
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z0-9][a-z0-9_-]*/giu) ?? []) {
    if (word.length >= 2) tokens.add(`w:${word}`);
  }
  for (const segment of normalized.match(/[\u3400-\u9fff]+/gu) ?? []) {
    if (segment.length === 1) tokens.add(`c:${segment}`);
    for (let index = 0; index < segment.length - 1; index += 1) tokens.add(`c:${segment.slice(index, index + 2)}`);
  }
  return tokens;
}
