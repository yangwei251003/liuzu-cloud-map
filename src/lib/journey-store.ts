export const JOURNEY_STORAGE_KEY = "liuzu-cloud-tour:journey-center:v1";

export type JourneyStop = {
  id: string;
  name: string;
  verification: string;
  dwellMinutes?: number | null;
  evidence?: string;
  confidence?: "EXPLICIT" | "ALIAS";
};

export type SavedRoute = {
  id: string;
  title: string;
  plannedDate: string;
  duration: string;
  pace: string;
  note: string;
  transport?: string;
  sourceText?: string;
  status?: string;
  planId?: string;
  revision?: number;
  validationStatus?: "BLOCKED";
  unresolvedCount?: number;
  executionStatus?: "NEEDS_REVALIDATION";
  stops: JourneyStop[];
  createdAt: string;
  updatedAt: string;
};

export type SavedRouteRevisionInput = {
  title: string;
  plannedDate: string;
  duration: string;
  pace: string;
  note: string;
  transport: string;
  stops: JourneyStop[];
};

export type SavedRouteRevisionResult =
  | { ok: true; changed: false; route: SavedRoute }
  | { ok: true; changed: true; route: SavedRoute }
  | { ok: false; error: string };

export type CheckInStamp = {
  id: string;
  spotId: string;
  spotName: string;
  note: string;
  stampedAt: string;
};

export type TravelogueDraft = {
  id: string;
  title: string;
  body: string;
  routeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JourneyData = {
  version: 1;
  routes: SavedRoute[];
  stamps: CheckInStamp[];
  drafts: TravelogueDraft[];
  updatedAt: string | null;
};

export type JourneyReadResult = {
  data: JourneyData;
  error: string | null;
};

export type JourneyWriteResult =
  | { ok: true }
  | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

export function createEmptyJourneyData(): JourneyData {
  return {
    version: 1,
    routes: [],
    stamps: [],
    drafts: [],
    updatedAt: null,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function readNullableString(record: UnknownRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function isIsoDateTime(value: string): boolean {
  return value.length <= 40 && !Number.isNaN(new Date(value).getTime());
}

function isPlannedDate(value: string): boolean {
  if (value === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

function isDwellMinutes(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (Number.isInteger(value) && (value as number) >= 10 && (value as number) <= 240)
  );
}

function parseJourneyStop(value: unknown): JourneyStop | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["id", "name", "verification", "dwellMinutes", "evidence", "confidence"])) return null;
  const id = readString(value, "id");
  const name = readString(value, "name");
  const verification = readString(value, "verification");
  if (
    !isBoundedString(id, 1, 120) ||
    !isBoundedString(name, 1, 120) ||
    !isBoundedString(verification, 1, 120) ||
    !isDwellMinutes(value.dwellMinutes) ||
    (value.evidence !== undefined && !isBoundedString(value.evidence, 1, 1_000)) ||
    (value.confidence !== undefined && value.confidence !== "EXPLICIT" && value.confidence !== "ALIAS")
  ) {
    return null;
  }
  const dwellMinutes = value.dwellMinutes as number | null | undefined;
  const evidence = typeof value.evidence === "string" ? value.evidence : undefined;
  const confidence = value.confidence === "EXPLICIT" || value.confidence === "ALIAS" ? value.confidence : undefined;
  return {
    id,
    name,
    verification,
    ...(dwellMinutes !== undefined ? { dwellMinutes } : {}),
    ...(evidence !== undefined ? { evidence } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

function parseSavedRoute(value: unknown): SavedRoute | null {
  if (!isRecord(value) || !Array.isArray(value.stops)) return null;
  if (!hasOnlyKeys(value, [
    "id",
    "title",
    "plannedDate",
    "duration",
    "pace",
    "note",
    "transport",
    "sourceText",
    "status",
    "planId",
    "revision",
    "validationStatus",
    "unresolvedCount",
    "executionStatus",
    "stops",
    "createdAt",
    "updatedAt",
  ])) return null;
  const id = readString(value, "id");
  const title = readString(value, "title");
  const plannedDate = readString(value, "plannedDate");
  const duration = readString(value, "duration");
  const pace = readString(value, "pace");
  const note = readString(value, "note");
  const transport = typeof value.transport === "string" ? value.transport : undefined;
  const sourceText = typeof value.sourceText === "string" ? value.sourceText : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;
  const planId = typeof value.planId === "string" ? value.planId : undefined;
  const revision = typeof value.revision === "number" ? value.revision : undefined;
  const validationStatus = value.validationStatus === "BLOCKED" ? value.validationStatus : undefined;
  const unresolvedCount = typeof value.unresolvedCount === "number" ? value.unresolvedCount : undefined;
  const executionStatus = value.executionStatus === "NEEDS_REVALIDATION" ? value.executionStatus : undefined;
  const createdAt = readString(value, "createdAt");
  const updatedAt = readString(value, "updatedAt");
  const stops = value.stops.map(parseJourneyStop);

  if (
    !isBoundedString(id, 1, 200) ||
    !isBoundedString(title, 1, 120) ||
    plannedDate === null ||
    !isPlannedDate(plannedDate) ||
    !isBoundedString(duration, 1, 160) ||
    !isBoundedString(pace, 1, 120) ||
    note === null || note.length > 1_000 ||
    (value.transport !== undefined && !isBoundedString(value.transport, 1, 120)) ||
    (value.sourceText !== undefined && !isBoundedString(value.sourceText, 0, 20_000)) ||
    (value.status !== undefined && !isBoundedString(value.status, 1, 120)) ||
    (value.planId !== undefined && !isBoundedString(value.planId, 1, 240)) ||
    (value.revision !== undefined && (!Number.isInteger(value.revision) || (value.revision as number) < 1 || (value.revision as number) > 1_000_000)) ||
    (value.validationStatus !== undefined && validationStatus === undefined) ||
    (value.unresolvedCount !== undefined && (!Number.isInteger(value.unresolvedCount) || (value.unresolvedCount as number) < 0 || (value.unresolvedCount as number) > 1_000_000)) ||
    (value.executionStatus !== undefined && executionStatus === undefined) ||
    !isBoundedString(createdAt, 1, 40) || !isIsoDateTime(createdAt) ||
    !isBoundedString(updatedAt, 1, 40) || !isIsoDateTime(updatedAt) ||
    value.stops.length === 0 || value.stops.length > 30 ||
    stops.some((stop) => stop === null)
  ) {
    return null;
  }

  return {
    id,
    title,
    plannedDate,
    duration,
    pace,
    note,
    ...(transport !== undefined ? { transport } : {}),
    ...(sourceText !== undefined ? { sourceText } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(planId !== undefined ? { planId } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(validationStatus !== undefined ? { validationStatus } : {}),
    ...(unresolvedCount !== undefined ? { unresolvedCount } : {}),
    ...(executionStatus !== undefined ? { executionStatus } : {}),
    stops: stops as JourneyStop[],
    createdAt,
    updatedAt,
  };
}

function parseCheckInStamp(value: unknown): CheckInStamp | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["id", "spotId", "spotName", "note", "stampedAt"])) return null;
  const id = readString(value, "id");
  const spotId = readString(value, "spotId");
  const spotName = readString(value, "spotName");
  const note = readString(value, "note");
  const stampedAt = readString(value, "stampedAt");
  if (
    !isBoundedString(id, 1, 200) ||
    !isBoundedString(spotId, 1, 120) ||
    !isBoundedString(spotName, 1, 120) ||
    note === null || note.length > 500 ||
    !isBoundedString(stampedAt, 1, 40) || !isIsoDateTime(stampedAt)
  ) return null;
  return { id, spotId, spotName, note, stampedAt };
}

function parseTravelogueDraft(value: unknown): TravelogueDraft | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ["id", "title", "body", "routeId", "createdAt", "updatedAt"])) return null;
  const id = readString(value, "id");
  const title = readString(value, "title");
  const body = readString(value, "body");
  const routeId = readNullableString(value, "routeId");
  const createdAt = readString(value, "createdAt");
  const updatedAt = readString(value, "updatedAt");
  if (
    !isBoundedString(id, 1, 200) ||
    !isBoundedString(title, 1, 160) ||
    body === null || body.length > 20_000 ||
    routeId === undefined || (routeId !== null && !isBoundedString(routeId, 1, 200)) ||
    !isBoundedString(createdAt, 1, 40) || !isIsoDateTime(createdAt) ||
    !isBoundedString(updatedAt, 1, 40) || !isIsoDateTime(updatedAt)
  ) return null;
  return { id, title, body, routeId, createdAt, updatedAt };
}

export function parseJourneyData(value: unknown): JourneyData | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!hasOnlyKeys(value, ["version", "routes", "stamps", "drafts", "updatedAt"])) return null;
  if (!Array.isArray(value.routes) || !Array.isArray(value.stamps) || !Array.isArray(value.drafts)) return null;

  const routes = value.routes.map(parseSavedRoute);
  const stamps = value.stamps.map(parseCheckInStamp);
  const drafts = value.drafts.map(parseTravelogueDraft);
  const updatedAt = readNullableString(value, "updatedAt");

  if (
    updatedAt === undefined ||
    routes.some((route) => route === null) ||
    stamps.some((stamp) => stamp === null) ||
    drafts.some((draft) => draft === null)
  ) {
    return null;
  }

  return {
    version: 1,
    routes: routes as SavedRoute[],
    stamps: stamps as CheckInStamp[],
    drafts: drafts as TravelogueDraft[],
    updatedAt,
  };
}

function normalizedEditableRoute(route: SavedRoute | SavedRouteRevisionInput): SavedRouteRevisionInput {
  return {
    title: route.title.trim(),
    plannedDate: route.plannedDate,
    duration: route.duration.trim(),
    pace: route.pace.trim(),
    note: route.note.trim(),
    transport: (route.transport ?? "未指定").trim(),
    stops: route.stops.map((stop) => ({
      ...stop,
      dwellMinutes: stop.dwellMinutes ?? null,
    })),
  };
}

function editableRouteEquals(left: SavedRouteRevisionInput, right: SavedRouteRevisionInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reviseSavedRoute(
  route: SavedRoute,
  input: SavedRouteRevisionInput,
  updatedAt = new Date().toISOString(),
): SavedRouteRevisionResult {
  if (!isIsoDateTime(updatedAt)) return { ok: false, error: "保存时间无效，请刷新页面后重试。" };

  const normalized = normalizedEditableRoute(input);
  if (!isBoundedString(normalized.title, 1, 60)) return { ok: false, error: "路线名称需为 1 至 60 个字符。" };
  if (!isPlannedDate(normalized.plannedDate)) return { ok: false, error: "计划日期格式无效。" };
  if (!isBoundedString(normalized.duration, 1, 120)) return { ok: false, error: "可用时间需为 1 至 120 个字符。" };
  if (!isBoundedString(normalized.pace, 1, 80)) return { ok: false, error: "游览节奏需为 1 至 80 个字符。" };
  if (normalized.note.length > 240) return { ok: false, error: "路线备注不能超过 240 个字符。" };
  if (!isBoundedString(normalized.transport, 1, 80)) return { ok: false, error: "交通方式需为 1 至 80 个字符。" };
  if (normalized.stops.length === 0) return { ok: false, error: "请至少保留一个候选节点。" };
  if (normalized.stops.length > 30) return { ok: false, error: "单条路线最多保留 30 个候选节点。" };
  if (new Set(normalized.stops.map((stop) => stop.id)).size !== normalized.stops.length) {
    return { ok: false, error: "候选节点不能重复。" };
  }
  if (normalized.stops.some((stop) => parseJourneyStop(stop) === null)) {
    return { ok: false, error: "候选节点或停留时间无效；停留时间应为 10 至 240 分钟的整数。" };
  }

  const current = normalizedEditableRoute(route);
  if (editableRouteEquals(current, normalized)) return { ok: true, changed: false, route };

  const currentRevision = route.revision ?? 1;
  if (!Number.isInteger(currentRevision) || currentRevision < 1 || currentRevision >= 1_000_000) {
    return { ok: false, error: "路线修订号无效或已达上限，无法继续编辑。" };
  }

  const {
    planId: _planId,
    validationStatus: _validationStatus,
    unresolvedCount: _unresolvedCount,
    ...routeWithoutStaleExecution
  } = route;
  void _planId;
  void _validationStatus;
  void _unresolvedCount;

  return {
    ok: true,
    changed: true,
    route: {
      ...routeWithoutStaleExecution,
      ...normalized,
      status: "NEEDS_REVALIDATION",
      executionStatus: "NEEDS_REVALIDATION",
      revision: currentRevision + 1,
      updatedAt,
    },
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJourneyData(): JourneyReadResult {
  const storage = browserStorage();
  if (!storage) {
    return {
      data: createEmptyJourneyData(),
      error: typeof window === "undefined" ? null : "当前浏览器不允许访问本地存储，旅程暂时无法保存。",
    };
  }

  try {
    const raw = storage.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return { data: createEmptyJourneyData(), error: null };
    const parsed = parseJourneyData(JSON.parse(raw) as unknown);
    if (!parsed) {
      return {
        data: createEmptyJourneyData(),
        error: "本地旅程数据格式异常。你可以重试读取，或清除这份损坏的数据后重新开始。",
      };
    }
    return { data: parsed, error: null };
  } catch {
    return {
      data: createEmptyJourneyData(),
      error: "读取本地旅程时遇到问题。原数据没有被覆盖，请稍后重试。",
    };
  }
}

export function writeJourneyData(data: JourneyData): JourneyWriteResult {
  const storage = browserStorage();
  if (!storage) {
    return { ok: false, error: "当前浏览器不允许本地保存。请检查隐私模式或存储权限。" };
  }

  try {
    storage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: "本地空间不足或保存被浏览器阻止。请先导出重要游记再清理空间。" };
  }
}

export function clearJourneyData(): JourneyWriteResult {
  const storage = browserStorage();
  if (!storage) {
    return { ok: false, error: "当前浏览器不允许访问本地存储，无法清除数据。" };
  }

  try {
    storage.removeItem(JOURNEY_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: "清除本地旅程失败，请检查浏览器存储权限后重试。" };
  }
}

export function createJourneyId(prefix: "route" | "stamp" | "draft"): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function journeyHasContent(data: JourneyData): boolean {
  return data.routes.length > 0 || data.stamps.length > 0 || data.drafts.length > 0;
}

export function formatTravelogueText(draft: TravelogueDraft, route?: SavedRoute): string {
  const sections = [draft.title.trim(), ""];

  if (route) {
    sections.push(`关联路线：${route.title}`);
    if (route.plannedDate) sections.push(`计划日期：${route.plannedDate}`);
    sections.push(`沿途节点：${route.stops.map((stop) => stop.name).join(" → ")}`);
    sections.push("");
  }

  sections.push(draft.body.trim() || "这篇游记还没有正文。", "", "保存于六祖云游 · 我的旅程（本地原型）");
  return sections.join("\n");
}
