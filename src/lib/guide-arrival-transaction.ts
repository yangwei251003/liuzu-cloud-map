import {
  GUIDE_SESSION_STORAGE_KEY,
  parseGuideSession,
  type GuideSessionRecord,
} from "./guide-session-store";
import {
  JOURNEY_STORAGE_KEY,
  createEmptyJourneyData,
  parseJourneyData,
  type JourneyData,
} from "./journey-store";

export const GUIDE_ARRIVAL_TRANSACTION_KEY = "liuzu-cloud-tour:guide-arrival-transaction:v1";

type TransactionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type ArrivalTransactionJournal = {
  version: 1;
  phase: "PREPARED" | "COMMITTED";
  beforeJourneyRaw: string | null;
  beforeSessionRaw: string;
  createdAt: string;
};

export type GuideArrivalCommitInput = {
  beforeJourney: JourneyData;
  afterJourney: JourneyData;
  beforeSession: GuideSessionRecord;
  afterSession: GuideSessionRecord;
  spotId: string;
  now?: Date;
};

export type GuideArrivalCommitResult =
  | { ok: true }
  | { ok: false; error: string; rolledBack: boolean };

function browserStorage(): TransactionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseRawJourney(raw: string | null): JourneyData | null {
  if (raw === null) return createEmptyJourneyData();
  try {
    return parseJourneyData(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function parseRawSession(raw: string | null): GuideSessionRecord | null {
  if (raw === null) return null;
  try {
    return parseGuideSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function parseJournal(raw: string): ArrivalTransactionJournal | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(",") !== "beforeJourneyRaw,beforeSessionRaw,createdAt,phase,version" ||
      value.version !== 1 ||
      (value.phase !== "PREPARED" && value.phase !== "COMMITTED") ||
      (value.beforeJourneyRaw !== null && typeof value.beforeJourneyRaw !== "string") ||
      typeof value.beforeSessionRaw !== "string" ||
      typeof value.createdAt !== "string" ||
      Number.isNaN(new Date(value.createdAt).getTime())
    ) {
      return null;
    }
    if (!parseRawJourney(value.beforeJourneyRaw) || !parseRawSession(value.beforeSessionRaw)) return null;
    return value as ArrivalTransactionJournal;
  } catch {
    return null;
  }
}

function canonical(value: JourneyData | GuideSessionRecord) {
  return JSON.stringify(value);
}

function restoreRaw(storage: TransactionStorage, key: string, raw: string | null) {
  if (raw === null) storage.removeItem(key);
  else storage.setItem(key, raw);
}

export function recoverGuideArrivalTransaction(storage: TransactionStorage | null = browserStorage()) {
  if (!storage) return { ok: false as const, recovered: false, error: "当前浏览器不允许访问本地存储，无法核对到点事务。" };
  let raw: string | null;
  try {
    raw = storage.getItem(GUIDE_ARRIVAL_TRANSACTION_KEY);
  } catch {
    return { ok: false as const, recovered: false, error: "读取到点事务记录失败，导览将保持只读。" };
  }
  if (!raw) return { ok: true as const, recovered: false };
  const journal = parseJournal(raw);
  if (!journal) return { ok: false as const, recovered: false, error: "到点事务记录格式异常，未自动覆盖旅程或进度。请清除本机损坏数据后重试。" };

  try {
    if (journal.phase === "PREPARED") {
      restoreRaw(storage, JOURNEY_STORAGE_KEY, journal.beforeJourneyRaw);
      storage.setItem(GUIDE_SESSION_STORAGE_KEY, journal.beforeSessionRaw);
    }
    storage.removeItem(GUIDE_ARRIVAL_TRANSACTION_KEY);
    return { ok: true as const, recovered: journal.phase === "PREPARED" };
  } catch {
    return { ok: false as const, recovered: false, error: "上一次到点事务未能完整恢复，已停止推进；请先导出或清除本机数据。" };
  }
}

export function commitGuideArrival(
  input: GuideArrivalCommitInput,
  storage: TransactionStorage | null = browserStorage(),
): GuideArrivalCommitResult {
  if (!storage) return { ok: false, rolledBack: false, error: "当前浏览器不允许本地保存，到点与印章均未推进。" };
  const now = input.now ?? new Date();
  if (
    Number.isNaN(now.getTime()) ||
    !parseJourneyData(input.beforeJourney) ||
    !parseJourneyData(input.afterJourney) ||
    !parseGuideSession(input.beforeSession) ||
    !parseGuideSession(input.afterSession) ||
    input.afterSession.revision !== input.beforeSession.revision + 1 ||
    input.afterSession.routeSignature !== input.beforeSession.routeSignature ||
    !input.afterJourney.stamps.some((stamp) => stamp.spotId === input.spotId)
  ) {
    return { ok: false, rolledBack: false, error: "到点事务输入未通过一致性校验，数据没有写入。" };
  }

  let beforeJourneyRaw: string | null;
  let beforeSessionRaw: string | null;
  try {
    beforeJourneyRaw = storage.getItem(JOURNEY_STORAGE_KEY);
    beforeSessionRaw = storage.getItem(GUIDE_SESSION_STORAGE_KEY);
  } catch {
    return { ok: false, rolledBack: false, error: "无法读取当前旅程与导览进度，数据没有写入。" };
  }
  const currentJourney = parseRawJourney(beforeJourneyRaw);
  const currentSession = parseRawSession(beforeSessionRaw);
  if (!currentJourney || !currentSession || canonical(currentJourney) !== canonical(input.beforeJourney) || canonical(currentSession) !== canonical(input.beforeSession)) {
    return { ok: false, rolledBack: false, error: "旅程或导览进度已在其他页面变化，请刷新后重试；本次没有覆盖新数据。" };
  }

  const journal: ArrivalTransactionJournal = {
    version: 1,
    phase: "PREPARED",
    beforeJourneyRaw,
    beforeSessionRaw: beforeSessionRaw as string,
    createdAt: now.toISOString(),
  };

  try {
    storage.setItem(GUIDE_ARRIVAL_TRANSACTION_KEY, JSON.stringify(journal));
    storage.setItem(JOURNEY_STORAGE_KEY, canonical(input.afterJourney));
    storage.setItem(GUIDE_SESSION_STORAGE_KEY, canonical(input.afterSession));
    storage.setItem(GUIDE_ARRIVAL_TRANSACTION_KEY, JSON.stringify({ ...journal, phase: "COMMITTED" }));
    storage.removeItem(GUIDE_ARRIVAL_TRANSACTION_KEY);
    return { ok: true };
  } catch {
    try {
      restoreRaw(storage, JOURNEY_STORAGE_KEY, beforeJourneyRaw);
      storage.setItem(GUIDE_SESSION_STORAGE_KEY, beforeSessionRaw as string);
      storage.removeItem(GUIDE_ARRIVAL_TRANSACTION_KEY);
      return { ok: false, rolledBack: true, error: "到点与印章未能一起保存，已恢复到操作前状态；请释放本机空间后重试。" };
    } catch {
      return { ok: false, rolledBack: false, error: "到点保存中断且自动恢复失败。已停止继续推进，请先导出或清除本机数据。" };
    }
  }
}
