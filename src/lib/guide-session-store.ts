import type { RoutePlan } from "./route-plan-store";

export const GUIDE_SESSION_STORAGE_KEY = "liuzu-cloud-tour:guide-session:v1";
export const RELIABLE_LOCATION_ACCURACY_METERS = 100;

export type GuideSessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED";
export type GuideSessionEndReason = "route_completed" | "ended_early" | null;
export type GuideSessionRouteMode = "ROUTE_PLAN" | "LEGACY_STOPS";

export type GuideSessionPlanBinding = {
  planId: string;
  planRevision: number;
  validationCheckedAt: string;
  validationFingerprint: string;
};

export type GuideSessionRecord = {
  version: 2;
  routeSignature: string;
  stopIds: string[];
  routeMode: GuideSessionRouteMode;
  planId: string | null;
  planRevision: number | null;
  validationCheckedAt: string | null;
  validationFingerprint: string | null;
  status: GuideSessionStatus;
  currentIndex: number;
  revision: number;
  endReason: GuideSessionEndReason;
  updatedAt: string;
};

export type GuideSessionEvent =
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ARRIVE" }
  | { type: "END_EARLY" }
  | { type: "RESTART" };

export type GuideSessionReadResult = {
  record: GuideSessionRecord | null;
  error: string | null;
};

export type GuideSessionWriteResult =
  | { ok: true }
  | { ok: false; error: string };

export type GuideSessionContextResult =
  | { ok: true }
  | { ok: false; reason: "ROUTE_CHANGED" | "PLAN_BINDING_CHANGED"; error: string };

export type CreateGuideSessionOptions = {
  now?: Date;
  previousRevision?: number;
  planBinding?: GuideSessionPlanBinding | null;
};

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type UnknownRecord = Record<string, unknown>;

const stopIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fingerprintPattern = /^rpv1-[a-f0-9]{8}$/;
const MAX_REVISION = 1_000_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: UnknownRecord, expected: string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validStopIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 12 &&
    value.every((id) => typeof id === "string" && id.length <= 80 && stopIdPattern.test(id)) &&
    new Set(value).size === value.length
  );
}

export function createGuideRouteSignature(stopIds: string[]): string {
  if (!validStopIds(stopIds)) throw new Error("invalid_guide_stops");
  return stopIds.join(",");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createRoutePlanValidationFingerprint(
  plan: Pick<RoutePlan, "id" | "revision" | "validation">,
): string {
  const canonical = JSON.stringify({
    planId: plan.id,
    planRevision: plan.revision,
    status: plan.validation.status,
    demoEligible: plan.validation.demoEligible,
    validationRevision: plan.validation.revision,
    checkedAt: plan.validation.checkedAt,
    issues: plan.validation.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
  });
  return `rpv1-${fnv1a(canonical)}`;
}

export function createGuideSessionPlanBinding(plan: Pick<RoutePlan, "id" | "revision" | "validation">): GuideSessionPlanBinding {
  return {
    planId: plan.id,
    planRevision: plan.revision,
    validationCheckedAt: plan.validation.checkedAt,
    validationFingerprint: createRoutePlanValidationFingerprint(plan),
  };
}

function validPlanBinding(value: GuideSessionPlanBinding): boolean {
  return (
    value.planId.trim().length > 0 &&
    value.planId.length <= 200 &&
    Number.isInteger(value.planRevision) &&
    value.planRevision >= 1 &&
    value.planRevision <= MAX_REVISION &&
    isIsoDate(value.validationCheckedAt) &&
    fingerprintPattern.test(value.validationFingerprint)
  );
}

export function matchGuideSessionContext(
  record: GuideSessionRecord,
  stopIds: string[],
  planBinding: GuideSessionPlanBinding | null,
): GuideSessionContextResult {
  const parsed = parseGuideSession(record);
  if (!parsed || createGuideRouteSignature(stopIds) !== parsed.routeSignature) {
    return { ok: false, reason: "ROUTE_CHANGED", error: "本机保存的是另一条演示路线，旧进度未自动恢复。" };
  }
  if (!planBinding) {
    return parsed.routeMode === "LEGACY_STOPS"
      ? { ok: true }
      : { ok: false, reason: "PLAN_BINDING_CHANGED", error: "本机进度绑定了 RoutePlan，不能作为旧版 stops 演示恢复。" };
  }
  if (
    parsed.routeMode !== "ROUTE_PLAN" ||
    parsed.planId !== planBinding.planId ||
    parsed.planRevision !== planBinding.planRevision ||
    parsed.validationCheckedAt !== planBinding.validationCheckedAt ||
    parsed.validationFingerprint !== planBinding.validationFingerprint
  ) {
    return {
      ok: false,
      reason: "PLAN_BINDING_CHANGED",
      error: "RoutePlan 的计划修订或校验记录已变化；即使站序相同，旧会话也不会恢复，请重新开始演示。",
    };
  }
  return { ok: true };
}

export function parseGuideSession(value: unknown): GuideSessionRecord | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "routeSignature",
      "stopIds",
      "routeMode",
      "planId",
      "planRevision",
      "validationCheckedAt",
      "validationFingerprint",
      "status",
      "currentIndex",
      "revision",
      "endReason",
      "updatedAt",
    ]) ||
    value.version !== 2 ||
    !validStopIds(value.stopIds) ||
    typeof value.routeSignature !== "string" ||
    value.routeSignature !== value.stopIds.join(",") ||
    (value.routeMode !== "ROUTE_PLAN" && value.routeMode !== "LEGACY_STOPS") ||
    !["ACTIVE", "PAUSED", "COMPLETED"].includes(String(value.status)) ||
    !Number.isInteger(value.currentIndex) ||
    (value.currentIndex as number) < 0 ||
    (value.currentIndex as number) >= value.stopIds.length ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 1 ||
    (value.revision as number) > MAX_REVISION ||
    !isIsoDate(value.updatedAt)
  ) {
    return null;
  }

  const routeMode = value.routeMode as GuideSessionRouteMode;
  const planFieldsValid = routeMode === "ROUTE_PLAN"
    ? typeof value.planId === "string" &&
      typeof value.planRevision === "number" &&
      typeof value.validationCheckedAt === "string" &&
      typeof value.validationFingerprint === "string" &&
      validPlanBinding({
        planId: value.planId,
        planRevision: value.planRevision,
        validationCheckedAt: value.validationCheckedAt,
        validationFingerprint: value.validationFingerprint,
      })
    : value.planId === null && value.planRevision === null && value.validationCheckedAt === null && value.validationFingerprint === null;
  if (!planFieldsValid) return null;

  const status = value.status as GuideSessionStatus;
  const endReason = value.endReason;
  if (
    !(
      (status === "COMPLETED" && endReason === "route_completed" && value.currentIndex === value.stopIds.length - 1) ||
      (status === "COMPLETED" && endReason === "ended_early") ||
      ((status === "ACTIVE" || status === "PAUSED") && endReason === null)
    )
  ) {
    return null;
  }

  return {
    version: 2,
    routeSignature: value.routeSignature,
    stopIds: [...value.stopIds],
    routeMode,
    planId: value.planId as string | null,
    planRevision: value.planRevision as number | null,
    validationCheckedAt: value.validationCheckedAt as string | null,
    validationFingerprint: value.validationFingerprint as string | null,
    status,
    currentIndex: value.currentIndex as number,
    revision: value.revision as number,
    endReason: endReason as GuideSessionEndReason,
    updatedAt: value.updatedAt,
  };
}

export function createGuideSession(stopIds: string[], options: CreateGuideSessionOptions = {}): GuideSessionRecord {
  const now = options.now ?? new Date();
  const previousRevision = options.previousRevision ?? 0;
  const planBinding = options.planBinding ?? null;
  if (Number.isNaN(now.getTime()) || !Number.isInteger(previousRevision) || previousRevision < 0 || previousRevision >= MAX_REVISION) {
    throw new Error("invalid_guide_session_seed");
  }
  if (planBinding && !validPlanBinding(planBinding)) throw new Error("invalid_guide_plan_binding");
  const routeSignature = createGuideRouteSignature(stopIds);
  return {
    version: 2,
    routeSignature,
    stopIds: [...stopIds],
    routeMode: planBinding ? "ROUTE_PLAN" : "LEGACY_STOPS",
    planId: planBinding?.planId ?? null,
    planRevision: planBinding?.planRevision ?? null,
    validationCheckedAt: planBinding?.validationCheckedAt ?? null,
    validationFingerprint: planBinding?.validationFingerprint ?? null,
    status: "ACTIVE",
    currentIndex: 0,
    revision: previousRevision + 1,
    endReason: null,
    updatedAt: now.toISOString(),
  };
}

export function transitionGuideSession(
  record: GuideSessionRecord,
  event: GuideSessionEvent,
  now: Date = new Date(),
): GuideSessionRecord {
  const current = parseGuideSession(record);
  if (!current || Number.isNaN(now.getTime()) || current.revision >= MAX_REVISION) {
    throw new Error("invalid_guide_transition_input");
  }

  let status = current.status;
  let currentIndex = current.currentIndex;
  let endReason = current.endReason;

  if (event.type === "PAUSE" && current.status === "ACTIVE") status = "PAUSED";
  else if (event.type === "RESUME" && current.status === "PAUSED") status = "ACTIVE";
  else if (event.type === "ARRIVE" && current.status === "ACTIVE") {
    if (current.currentIndex >= current.stopIds.length - 1) {
      status = "COMPLETED";
      endReason = "route_completed";
    } else {
      currentIndex += 1;
    }
  } else if (event.type === "END_EARLY" && (current.status === "ACTIVE" || current.status === "PAUSED")) {
    status = "COMPLETED";
    endReason = "ended_early";
  } else if (event.type === "RESTART" && current.status === "COMPLETED") {
    status = "ACTIVE";
    currentIndex = 0;
    endReason = null;
  } else {
    throw new Error("invalid_guide_transition");
  }

  const next = parseGuideSession({
    ...current,
    status,
    currentIndex,
    endReason,
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
  });
  if (!next) throw new Error("invalid_guide_transition_result");
  return next;
}

function browserStorage(): SessionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readGuideSession(storage: SessionStorage | null = browserStorage()): GuideSessionReadResult {
  if (!storage) {
    return {
      record: null,
      error: typeof window === "undefined" ? null : "当前浏览器不允许读取演示进度。",
    };
  }
  try {
    const raw = storage.getItem(GUIDE_SESSION_STORAGE_KEY);
    if (!raw) return { record: null, error: null };
    const record = parseGuideSession(JSON.parse(raw) as unknown);
    if (!record) return { record: null, error: "本机演示进度格式异常，未自动恢复。" };
    return { record, error: null };
  } catch {
    return { record: null, error: "读取本机演示进度失败，未自动恢复。" };
  }
}

export function writeGuideSession(
  record: GuideSessionRecord,
  storage: SessionStorage | null = browserStorage(),
): GuideSessionWriteResult {
  const parsed = parseGuideSession(record);
  if (!parsed) return { ok: false, error: "演示进度未通过校验，未写入本机。" };
  if (!storage) return { ok: false, error: "当前浏览器不允许保存演示进度。" };
  try {
    storage.setItem(GUIDE_SESSION_STORAGE_KEY, JSON.stringify(parsed));
    return { ok: true };
  } catch {
    return { ok: false, error: "演示进度保存失败，状态没有推进；刷新后也无法恢复本次操作。" };
  }
}

export function clearGuideSession(storage: SessionStorage | null = browserStorage()): GuideSessionWriteResult {
  if (!storage) return { ok: false, error: "当前浏览器不允许清除演示进度。" };
  try {
    storage.removeItem(GUIDE_SESSION_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: "清除演示进度失败。" };
  }
}

export function classifyLocationAccuracy(accuracy: number): "reliable_for_rough_distance" | "low_accuracy" | "invalid" {
  if (!Number.isFinite(accuracy) || accuracy < 0) return "invalid";
  return accuracy <= RELIABLE_LOCATION_ACCURACY_METERS ? "reliable_for_rough_distance" : "low_accuracy";
}
