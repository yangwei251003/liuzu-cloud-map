import type {
  ExtractionConfidence,
  ItineraryAmbiguity,
  ItineraryCandidateOption,
  ItineraryExtraction,
  UnrecognizedFragment,
  UnresolvedIssue,
  UnresolvedResolution,
} from "./itinerary-extract/types";

export const ROUTE_PLAN_STORAGE_KEY = "liuzu-cloud-tour:route-plans:v1";

export type RoutePlanStop = {
  id: string;
  name: string;
  verification: string;
  evidence: string;
  start: number;
  end: number;
  dwellMinutes: number | null;
  confidence: ExtractionConfidence;
  eligibleForRoute: boolean;
  includedInDemo: boolean;
  reviewNote: string;
};

export type RoutePlanAmbiguityResolution = {
  ambiguityId: string;
  evidence: string;
  start: number;
  end: number;
  decision: "SELECTED" | "EXCLUDED";
  selectedCandidateId: string | null;
  reason: string;
  resolvedAt: string;
};

export type RoutePlanValidationIssue = {
  code: "NO_DEMO_STOPS" | "UNPUBLISHED_ENTRY" | "UNVERIFIED_ROUTE" | "UNRESOLVED_INPUT" | "INELIGIBLE_STOP";
  severity: "BLOCKING" | "UNRESOLVED";
  message: string;
};

export type RoutePlanValidation = {
  status: "BLOCKED";
  demoEligible: boolean;
  revision: number;
  checkedAt: string;
  issues: RoutePlanValidationIssue[];
};

export type RoutePlan = {
  schemaVersion: 2;
  id: string;
  revision: number;
  title: string;
  transport: string;
  sourceText: string;
  extraction: Pick<ItineraryExtraction, "requestId" | "mode">;
  stops: RoutePlanStop[];
  ambiguities: ItineraryAmbiguity[];
  ambiguityResolutions: RoutePlanAmbiguityResolution[];
  unrecognizedFragments: UnrecognizedFragment[];
  unresolved: UnresolvedIssue[];
  validation: RoutePlanValidation;
  createdAt: string;
  updatedAt: string;
};

export type RoutePlanStore = {
  version: 2;
  plans: RoutePlan[];
  updatedAt: string | null;
};

export type CreateRoutePlanInput = {
  title: string;
  transport: string;
  sourceText: string;
  extraction: ItineraryExtraction;
  stops: RoutePlanStop[];
  ambiguityResolutions?: RoutePlanAmbiguityResolution[];
};

export type RoutePlanResult = { ok: true; plan: RoutePlan } | { ok: false; error: string };
export type RoutePlanWriteResult = { ok: true } | { ok: false; error: string };
export type RoutePlanReadResult = { plan: RoutePlan | null; error: string | null };
export type RoutePlanStopsResult = { ok: true; stops: RoutePlanStop[] } | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

const confidenceValues: ExtractionConfidence[] = ["EXPLICIT", "ALIAS", "FUZZY"];
const issueCodes: RoutePlanValidationIssue["code"][] = ["NO_DEMO_STOPS", "UNPUBLISHED_ENTRY", "UNVERIFIED_ROUTE", "UNRESOLVED_INPUT", "INELIGIBLE_STOP"];
const unresolvedTypes: UnresolvedIssue["type"][] = ["DWELL_TIME", "TIME_WINDOW", "ACTION_CONSTRAINT", "UNKNOWN_FRAGMENT"];

export function createEmptyRoutePlanStore(): RoutePlanStore {
  return { version: 2, plans: [], updatedAt: null };
}

export function createRoutePlanId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `plan-${randomId}`;
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: UnknownRecord, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function hasExactEvidence(value: UnknownRecord, sourceText: string, field: "evidence" | "text"): boolean {
  return isNonEmptyString(value[field])
    && isIntegerInRange(value.start, 0, sourceText.length)
    && isIntegerInRange(value.end, 0, sourceText.length)
    && value.end > value.start
    && sourceText.slice(value.start, value.end) === value[field];
}

function parseStop(value: unknown, sourceText: string): RoutePlanStop | null {
  if (!isRecord(value)) return null;
  const dwellValid = value.dwellMinutes === null || isIntegerInRange(value.dwellMinutes, 10, 240);
  if (
    !hasOnlyKeys(value, ["id", "name", "verification", "evidence", "start", "end", "dwellMinutes", "confidence", "eligibleForRoute", "includedInDemo", "reviewNote"]) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.verification) ||
    !hasExactEvidence(value, sourceText, "evidence") ||
    !dwellValid ||
    !confidenceValues.includes(value.confidence as ExtractionConfidence) ||
    typeof value.eligibleForRoute !== "boolean" ||
    typeof value.includedInDemo !== "boolean" ||
    !isNonEmptyString(value.reviewNote)
  ) return null;
  if (value.includedInDemo && !value.eligibleForRoute) return null;
  return value as RoutePlanStop;
}

function parseCandidate(value: unknown): ItineraryCandidateOption | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "name", "confidence", "eligibleForRoute", "reviewNote"]) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    value.confidence !== "FUZZY" ||
    typeof value.eligibleForRoute !== "boolean" ||
    !isNonEmptyString(value.reviewNote)
  ) return null;
  return value as ItineraryCandidateOption;
}

function parseAmbiguity(value: unknown, sourceText: string): ItineraryAmbiguity | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "evidence", "start", "end", "reason", "status", "candidates"]) ||
    !isNonEmptyString(value.id) ||
    !hasExactEvidence(value, sourceText, "evidence") ||
    !isNonEmptyString(value.reason) ||
    value.status !== "UNRESOLVED" ||
    !Array.isArray(value.candidates)
  ) return null;
  const candidates = value.candidates.map(parseCandidate);
  if (candidates.length < 2 || candidates.some((item) => item === null)) return null;
  const typed = candidates as ItineraryCandidateOption[];
  if (new Set(typed.map((item) => item.id)).size !== typed.length) return null;
  return { ...value, candidates: typed } as ItineraryAmbiguity;
}

function parseAmbiguityResolution(
  value: unknown,
  sourceText: string,
  ambiguityById: Map<string, ItineraryAmbiguity>,
  stopById: Map<string, RoutePlanStop>,
): RoutePlanAmbiguityResolution | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["ambiguityId", "evidence", "start", "end", "decision", "selectedCandidateId", "reason", "resolvedAt"]) ||
    !isNonEmptyString(value.ambiguityId) ||
    !hasExactEvidence(value, sourceText, "evidence") ||
    (value.decision !== "SELECTED" && value.decision !== "EXCLUDED") ||
    !isNonEmptyString(value.reason) ||
    !isIsoDate(value.resolvedAt)
  ) return null;
  const ambiguity = ambiguityById.get(value.ambiguityId);
  if (!ambiguity || value.evidence !== ambiguity.evidence || value.start !== ambiguity.start || value.end !== ambiguity.end) return null;
  if (value.decision === "SELECTED") {
    if (!isNonEmptyString(value.selectedCandidateId)) return null;
    const candidate = ambiguity.candidates.find((item) => item.id === value.selectedCandidateId);
    const stop = stopById.get(value.selectedCandidateId);
    if (!candidate || !stop || candidate.eligibleForRoute !== stop.eligibleForRoute || stop.includedInDemo !== stop.eligibleForRoute) return null;
  } else if (value.selectedCandidateId !== null) {
    return null;
  }
  return value as RoutePlanAmbiguityResolution;
}

function parseUnrecognized(value: unknown, sourceText: string): UnrecognizedFragment | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["text", "start", "end", "reason"]) || !hasExactEvidence(value, sourceText, "text") || value.reason !== "UNKNOWN_PLACE_OR_ACTIVITY") return null;
  return value as UnrecognizedFragment;
}

function parseResolution(value: unknown, status: UnresolvedIssue["status"]): UnresolvedResolution | null {
  if (status === "UNRESOLVED") return null;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["method", "value", "reason", "resolvedAt"]) ||
    (value.method !== "VALUE_PROVIDED" && value.method !== "EXPLICITLY_IGNORED") ||
    typeof value.value !== "string" ||
    !isNonEmptyString(value.reason) ||
    !isIsoDate(value.resolvedAt)
  ) return null;
  if (status === "RESOLVED" && (value.method !== "VALUE_PROVIDED" || !isNonEmptyString(value.value))) return null;
  if (status === "IGNORED" && value.method !== "EXPLICITLY_IGNORED") return null;
  return value as UnresolvedResolution;
}

function parseUnresolved(value: unknown, sourceText: string): UnresolvedIssue | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "type", "evidence", "message", "stopId", "start", "end", "blocking", "status", "resolution"]) ||
    !isNonEmptyString(value.id) ||
    !unresolvedTypes.includes(value.type as UnresolvedIssue["type"]) ||
    !hasExactEvidence(value, sourceText, "evidence") ||
    !isNonEmptyString(value.message) ||
    !(value.stopId === null || isNonEmptyString(value.stopId)) ||
    value.blocking !== true ||
    (value.status !== "UNRESOLVED" && value.status !== "RESOLVED" && value.status !== "IGNORED")
  ) return null;
  const resolution = parseResolution(value.resolution, value.status as UnresolvedIssue["status"]);
  if ((value.status === "UNRESOLVED" && value.resolution !== null) || (value.status !== "UNRESOLVED" && !resolution)) return null;
  return { ...value, resolution } as UnresolvedIssue;
}

function parseLegacyUnresolved(value: unknown, sourceText: string): UnresolvedIssue | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "type", "evidence", "message", "stopId", "start", "end", "blocking", "status", "resolution"]) ||
    !isNonEmptyString(value.id) ||
    !unresolvedTypes.includes(value.type as UnresolvedIssue["type"]) ||
    !hasExactEvidence(value, sourceText, "evidence") ||
    !isNonEmptyString(value.message) ||
    !(value.stopId === null || isNonEmptyString(value.stopId)) ||
    value.status !== "UNRESOLVED"
  ) return null;
  return { ...value, blocking: true, status: "UNRESOLVED", resolution: null } as UnresolvedIssue;
}

function unresolvedReviewCount(
  unresolved: UnresolvedIssue[],
  ambiguities: ItineraryAmbiguity[],
  ambiguityResolutions: RoutePlanAmbiguityResolution[],
): number {
  const resolvedAmbiguities = new Set(ambiguityResolutions.map((item) => item.ambiguityId));
  return unresolved.filter((issue) => issue.blocking && issue.status === "UNRESOLVED").length
    + ambiguities.filter((item) => !resolvedAmbiguities.has(item.id)).length;
}

function buildValidation(
  stops: RoutePlanStop[],
  unresolved: UnresolvedIssue[],
  ambiguities: ItineraryAmbiguity[],
  ambiguityResolutions: RoutePlanAmbiguityResolution[],
  revision: number,
  checkedAt: string,
): RoutePlanValidation {
  const includedStops = stops.filter((stop) => stop.includedInDemo && stop.eligibleForRoute);
  const openReview = unresolvedReviewCount(unresolved, ambiguities, ambiguityResolutions);
  const issues: RoutePlanValidationIssue[] = [
    { code: "UNPUBLISHED_ENTRY", severity: "BLOCKING", message: "尚无管理方发布并在有效期内的正式入口数据。" },
    { code: "UNVERIFIED_ROUTE", severity: "BLOCKING", message: "候选道路未经现场复走，也没有正式 RouteValidation 通过记录。" },
  ];
  if (!includedStops.length) issues.push({ code: "NO_DEMO_STOPS", severity: "BLOCKING", message: "没有可用于本机演示的候选站点。" });
  if (stops.some((stop) => !stop.eligibleForRoute)) issues.push({ code: "INELIGIBLE_STOP", severity: "BLOCKING", message: "存在禁止自动执行的候选点，已排除在演示站序之外。" });
  if (openReview) issues.push({ code: "UNRESOLVED_INPUT", severity: "BLOCKING", message: `仍有 ${openReview} 项歧义、时间、约束或未知片段未解决。` });
  return {
    status: "BLOCKED",
    demoEligible: includedStops.length > 0 && openReview === 0,
    revision,
    checkedAt,
    issues,
  };
}

function parseValidation(value: unknown, expected: RoutePlanValidation): RoutePlanValidation | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["status", "demoEligible", "revision", "checkedAt", "issues"]) ||
    value.status !== expected.status ||
    value.demoEligible !== expected.demoEligible ||
    value.revision !== expected.revision ||
    !isIsoDate(value.checkedAt) ||
    !Array.isArray(value.issues)
  ) return null;
  const issues = value.issues.flatMap((issue) => {
    if (
      !isRecord(issue) ||
      !hasOnlyKeys(issue, ["code", "severity", "message"]) ||
      !issueCodes.includes(issue.code as RoutePlanValidationIssue["code"]) ||
      (issue.severity !== "BLOCKING" && issue.severity !== "UNRESOLVED") ||
      !isNonEmptyString(issue.message)
    ) return [];
    return [issue as RoutePlanValidationIssue];
  });
  if (issues.length !== value.issues.length) return null;
  if (
    issues.length !== expected.issues.length ||
    expected.issues.some((expectedIssue) => !issues.some((issue) => issue.code === expectedIssue.code && issue.severity === expectedIssue.severity))
  ) return null;
  return { status: "BLOCKED", demoEligible: expected.demoEligible, revision: expected.revision, checkedAt: value.checkedAt as string, issues };
}

function parseRoutePlanV2(value: UnknownRecord): RoutePlan | null {
  if (
    !hasOnlyKeys(value, ["schemaVersion", "id", "revision", "title", "transport", "sourceText", "extraction", "stops", "ambiguities", "ambiguityResolutions", "unrecognizedFragments", "unresolved", "validation", "createdAt", "updatedAt"]) ||
    value.schemaVersion !== 2 ||
    !isNonEmptyString(value.id) ||
    !isIntegerInRange(value.revision, 1, 1_000_000) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.transport) ||
    typeof value.sourceText !== "string" ||
    value.sourceText.length < 4 ||
    value.sourceText.length > 6_000 ||
    !isRecord(value.extraction) ||
    !hasOnlyKeys(value.extraction, ["requestId", "mode"]) ||
    !isNonEmptyString(value.extraction.requestId) ||
    (value.extraction.mode !== "MODEL_GROUNDED" && value.extraction.mode !== "LOCAL_RULES") ||
    !Array.isArray(value.stops) ||
    !Array.isArray(value.ambiguities) ||
    !Array.isArray(value.ambiguityResolutions) ||
    !Array.isArray(value.unrecognizedFragments) ||
    !Array.isArray(value.unresolved) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) return null;

  const sourceText = value.sourceText;
  const stops = value.stops.map((item) => parseStop(item, sourceText));
  const ambiguities = value.ambiguities.map((item) => parseAmbiguity(item, sourceText));
  const unrecognizedFragments = value.unrecognizedFragments.map((item) => parseUnrecognized(item, sourceText));
  const unresolved = value.unresolved.map((item) => parseUnresolved(item, sourceText));
  if (
    stops.some((item) => item === null) ||
    ambiguities.some((item) => item === null) ||
    unrecognizedFragments.some((item) => item === null) ||
    unresolved.some((item) => item === null)
  ) return null;

  const typedStops = stops as RoutePlanStop[];
  const typedAmbiguities = ambiguities as ItineraryAmbiguity[];
  const typedUnresolved = unresolved as UnresolvedIssue[];
  const stopById = new Map(typedStops.map((stop) => [stop.id, stop]));
  const stopIds = new Set(stopById.keys());
  const ambiguityIds = new Set(typedAmbiguities.map((item) => item.id));
  if (stopIds.size !== typedStops.length || ambiguityIds.size !== typedAmbiguities.length) return null;
  if (typedUnresolved.some((issue) => issue.stopId !== null && !stopIds.has(issue.stopId))) return null;
  if (new Set(typedUnresolved.map((issue) => issue.id)).size !== typedUnresolved.length) return null;
  if (typedUnresolved.some((issue) => {
    if (issue.type !== "DWELL_TIME" || issue.status !== "RESOLVED" || !issue.stopId || !issue.resolution) return false;
    const dwell = stopById.get(issue.stopId)?.dwellMinutes;
    return dwell === null || dwell === undefined || issue.resolution.value !== `${dwell} 分钟`;
  })) return null;

  const ambiguityById = new Map(typedAmbiguities.map((item) => [item.id, item]));
  const ambiguityResolutions = value.ambiguityResolutions.map((item) => parseAmbiguityResolution(item, sourceText, ambiguityById, stopById));
  if (ambiguityResolutions.some((item) => item === null)) return null;
  const typedResolutions = ambiguityResolutions as RoutePlanAmbiguityResolution[];
  if (new Set(typedResolutions.map((item) => item.ambiguityId)).size !== typedResolutions.length) return null;
  if (typedStops.some((stop) => stop.confidence === "FUZZY" && !typedResolutions.some((resolution) => {
    const ambiguity = ambiguityById.get(resolution.ambiguityId);
    return resolution.decision === "SELECTED"
      && resolution.selectedCandidateId === stop.id
      && ambiguity?.evidence === stop.evidence
      && ambiguity.start === stop.start
      && ambiguity.end === stop.end;
  }))) return null;

  const checkedAt = isRecord(value.validation) && isIsoDate(value.validation.checkedAt) ? value.validation.checkedAt : "";
  const expectedValidation = buildValidation(typedStops, typedUnresolved, typedAmbiguities, typedResolutions, value.revision, checkedAt);
  const validation = parseValidation(value.validation, expectedValidation);
  if (!validation) return null;

  return {
    schemaVersion: 2,
    id: value.id,
    revision: value.revision,
    title: value.title,
    transport: value.transport,
    sourceText,
    extraction: { requestId: value.extraction.requestId, mode: value.extraction.mode },
    stops: typedStops,
    ambiguities: typedAmbiguities,
    ambiguityResolutions: typedResolutions,
    unrecognizedFragments: unrecognizedFragments as UnrecognizedFragment[],
    unresolved: typedUnresolved,
    validation,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function migrateRoutePlanV1(value: UnknownRecord): RoutePlan | null {
  if (
    !hasOnlyKeys(value, ["schemaVersion", "id", "revision", "title", "transport", "sourceText", "extraction", "stops", "unrecognizedFragments", "unresolved", "validation", "createdAt", "updatedAt"]) ||
    value.schemaVersion !== 1 ||
    !isNonEmptyString(value.id) ||
    !isIntegerInRange(value.revision, 1, 1_000_000) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.transport) ||
    typeof value.sourceText !== "string" ||
    value.sourceText.length < 4 ||
    value.sourceText.length > 6_000 ||
    !isRecord(value.extraction) ||
    !hasOnlyKeys(value.extraction, ["requestId", "mode"]) ||
    !isNonEmptyString(value.extraction.requestId) ||
    (value.extraction.mode !== "MODEL_GROUNDED" && value.extraction.mode !== "LOCAL_RULES") ||
    !Array.isArray(value.stops) ||
    !Array.isArray(value.unrecognizedFragments) ||
    !Array.isArray(value.unresolved) ||
    !isRecord(value.validation) ||
    !hasOnlyKeys(value.validation, ["status", "demoEligible", "revision", "checkedAt", "issues"]) ||
    value.validation.status !== "BLOCKED" ||
    typeof value.validation.demoEligible !== "boolean" ||
    value.validation.revision !== value.revision ||
    !isIsoDate(value.validation.checkedAt) ||
    !Array.isArray(value.validation.issues) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) return null;

  const legacyIssues = value.validation.issues;
  if (legacyIssues.some((issue) => !isRecord(issue)
    || !hasOnlyKeys(issue, ["code", "severity", "message"])
    || !issueCodes.includes(issue.code as RoutePlanValidationIssue["code"])
    || (issue.severity !== "BLOCKING" && issue.severity !== "UNRESOLVED")
    || !isNonEmptyString(issue.message))) return null;
  const legacyCodes = new Set(legacyIssues.map((issue) => (issue as UnknownRecord).code));
  if (!legacyCodes.has("UNPUBLISHED_ENTRY") || !legacyCodes.has("UNVERIFIED_ROUTE")) return null;

  const sourceText = value.sourceText;
  const stops = value.stops.map((item) => parseStop(item, sourceText));
  const unrecognizedFragments = value.unrecognizedFragments.map((item) => parseUnrecognized(item, sourceText));
  const unresolved = value.unresolved.map((item) => parseLegacyUnresolved(item, sourceText));
  if (stops.some((item) => item === null) || unrecognizedFragments.some((item) => item === null) || unresolved.some((item) => item === null)) return null;
  const typedStops = stops as RoutePlanStop[];
  const typedUnresolved = unresolved as UnresolvedIssue[];
  const stopIds = new Set(typedStops.map((stop) => stop.id));
  if (stopIds.size !== typedStops.length || typedUnresolved.some((issue) => issue.stopId !== null && !stopIds.has(issue.stopId))) return null;

  const validation = buildValidation(typedStops, typedUnresolved, [], [], value.revision, value.updatedAt);
  return {
    schemaVersion: 2,
    id: value.id,
    revision: value.revision,
    title: value.title,
    transport: value.transport,
    sourceText,
    extraction: { requestId: value.extraction.requestId, mode: value.extraction.mode },
    stops: typedStops,
    ambiguities: [],
    ambiguityResolutions: [],
    unrecognizedFragments: unrecognizedFragments as UnrecognizedFragment[],
    unresolved: typedUnresolved,
    validation,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseRoutePlan(value: unknown): RoutePlan | null {
  if (!isRecord(value)) return null;
  return value.schemaVersion === 2 ? parseRoutePlanV2(value) : migrateRoutePlanV1(value);
}

export function parseRoutePlanStore(value: unknown): RoutePlanStore | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["version", "plans", "updatedAt"]) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.plans) ||
    !(value.updatedAt === null || isIsoDate(value.updatedAt))
  ) return null;
  const plans = value.plans.map(parseRoutePlan);
  if (plans.some((plan) => plan === null)) return null;
  return { version: 2, plans: plans as RoutePlan[], updatedAt: value.updatedAt as string | null };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStore(): { store: RoutePlanStore; error: string | null } {
  const storage = browserStorage();
  if (!storage) return { store: createEmptyRoutePlanStore(), error: typeof window === "undefined" ? null : "当前浏览器不允许读取本地行程快照。" };
  try {
    const raw = storage.getItem(ROUTE_PLAN_STORAGE_KEY);
    if (!raw) return { store: createEmptyRoutePlanStore(), error: null };
    const store = parseRoutePlanStore(JSON.parse(raw) as unknown);
    return store ? { store, error: null } : { store: createEmptyRoutePlanStore(), error: "本地 RoutePlan 格式异常，已拒绝读取且未覆盖原数据。" };
  } catch {
    return { store: createEmptyRoutePlanStore(), error: "读取本地 RoutePlan 失败，原数据没有被覆盖。" };
  }
}

export function readRoutePlan(planId: string): RoutePlanReadResult {
  if (!planId.trim()) return { plan: null, error: "缺少 planId，无法读取规划快照。" };
  const read = readStore();
  if (read.error) return { plan: null, error: read.error };
  const plan = read.store.plans.find((item) => item.id === planId) ?? null;
  return plan ? { plan, error: null } : { plan: null, error: "没有在这台设备上找到对应的 RoutePlan；它可能已被清除或来自另一台设备。" };
}

export function resolveRoutePlanStops(plan: RoutePlan, knownStopIds: Iterable<string>): RoutePlanStopsResult {
  if (!plan.validation.demoEligible) return { ok: false, error: "RoutePlan 仍有未解决输入或没有可用站点，已拒绝启动演示。" };
  const known = new Set(knownStopIds);
  const included = plan.stops.filter((stop) => stop.includedInDemo && stop.eligibleForRoute);
  const unknown = included.filter((stop) => !known.has(stop.id));
  if (unknown.length) return { ok: false, error: `RoutePlan 包含 ${unknown.length} 个当前版本无法识别的站点，已拒绝启动演示。` };
  if (!included.length) return { ok: false, error: "RoutePlan 没有可用于本机演示的候选站点。" };
  return { ok: true, stops: included };
}

export function saveRoutePlan(plan: RoutePlan): RoutePlanWriteResult {
  const parsed = parseRoutePlan(plan);
  if (!parsed) return { ok: false, error: "RoutePlan 未通过严格 schema 校验，已拒绝保存。" };
  const storage = browserStorage();
  if (!storage) return { ok: false, error: "当前浏览器不允许保存本地行程快照。" };
  const read = readStore();
  if (read.error) return { ok: false, error: read.error };
  const plans = [parsed, ...read.store.plans.filter((item) => item.id !== parsed.id)].slice(0, 20);
  try {
    storage.setItem(ROUTE_PLAN_STORAGE_KEY, JSON.stringify({ version: 2, plans, updatedAt: parsed.updatedAt } satisfies RoutePlanStore));
    return { ok: true };
  } catch {
    return { ok: false, error: "本地空间不足或存储被阻止，RoutePlan 未保存。" };
  }
}

export function createRoutePlanSnapshot(input: CreateRoutePlanInput, now = new Date().toISOString()): RoutePlanResult {
  const title = input.title.trim();
  const transport = input.transport.trim();
  const sourceText = input.sourceText;
  if (!title || !transport || sourceText.trim().length < 4 || sourceText.length > 6_000 || !isIsoDate(now)) {
    return { ok: false, error: "RoutePlan 的标题、交通方式、原文或校验时间不完整。" };
  }
  const ambiguityResolutions = input.ambiguityResolutions ?? [];
  const ambiguities = Array.isArray(input.extraction.ambiguities) ? input.extraction.ambiguities : [];
  const validation = buildValidation(input.stops, input.extraction.unresolved, ambiguities, ambiguityResolutions, 1, now);
  const plan: RoutePlan = {
    schemaVersion: 2,
    id: createRoutePlanId(),
    revision: 1,
    title,
    transport,
    sourceText,
    extraction: { requestId: input.extraction.requestId, mode: input.extraction.mode },
    stops: input.stops,
    ambiguities,
    ambiguityResolutions,
    unrecognizedFragments: input.extraction.unrecognizedFragments,
    unresolved: input.extraction.unresolved,
    validation,
    createdAt: now,
    updatedAt: now,
  };
  return parseRoutePlan(plan) ? { ok: true, plan } : { ok: false, error: "RoutePlan 快照未通过严格 schema 校验。" };
}
