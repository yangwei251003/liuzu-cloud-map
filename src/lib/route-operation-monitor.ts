import { getSafePublishedNetwork, parseRouteNetwork } from "./route-network";
import { getSafeRouteOperationalState } from "./route-operational-state";

/** Active sessions must re-check formal operating state at least every 15 seconds. */
export const ROUTE_OPERATION_MONITOR_INTERVAL_MS = 15_000;

const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type UnknownRecord = Record<string, unknown>;

export type RouteOperationalMonitorTrigger =
  | "START"
  | "INTERVAL"
  | "PAGE_VISIBLE"
  | "NETWORK_ONLINE"
  | "NETWORK_OFFLINE"
  | "MANUAL";

/**
 * The immutable version commitment copied from a deterministically generated
 * route plan. It intentionally contains no provider geometry, coordinates, or
 * AI-derived fallback data.
 */
export type RouteOperationalMonitorRoute = {
  schemaVersion: 1;
  routeId: string;
  scenicAreaId: string;
  networkRevision: string;
  operationalVersion: number;
  expiresAt: string;
};

/** The only subset of a formal snapshot that navigation monitoring retains. */
export type VerifiedRouteOperationalSnapshot = {
  schemaVersion: 1;
  scenicAreaId: string;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  publishedAt: string;
  expiresAt: string;
};

export type RouteOperationalMonitorUnavailableCode =
  | "FORMAL_NETWORK_UNAVAILABLE"
  | "NETWORK_REQUEST_FAILED"
  | "OFFLINE_SNAPSHOT_MISSING";

/**
 * A snapshot can come only from the formal snapshot endpoint or a previously
 * validated in-memory formal snapshot while the device is offline. No map
 * provider, candidate geometry, or model output is an accepted source.
 */
export type RouteOperationalMonitorSource =
  | {
    kind: "FORMAL_SNAPSHOT";
    transport: "ONLINE" | "OFFLINE";
    snapshot: unknown;
  }
  | {
    kind: "UNAVAILABLE";
    transport: "ONLINE" | "OFFLINE";
    code: RouteOperationalMonitorUnavailableCode;
  };

export type RouteOperationalReplanRequest = {
  mode: "DETERMINISTIC_FORMAL_ROUTE";
  scenicAreaId: string;
  expectedNetworkRevision: string;
  expectedOperationalVersion: number;
  supersedesRouteId: string;
  reason: "NETWORK_REVISION_CHANGED" | "OPERATIONAL_VERSION_CHANGED";
};

/**
 * A monitor never accepts a provider or model result as a replan. The
 * integration layer may pass only a newly committed deterministic formal route
 * together with the formal snapshot it was planned against, or an explicit
 * no-safe-route result.
 */
export type RouteOperationalDeterministicReplanOutcome =
  | {
    kind: "DETERMINISTIC_ROUTE_AVAILABLE";
    route: unknown;
    snapshot: unknown;
  }
  | {
    kind: "NO_SAFE_ROUTE";
    code: "FORMAL_NETWORK_UNAVAILABLE" | "ROUTE_UNAVAILABLE";
  };

export type RouteOperationalMonitorReason =
  | "MONITOR_NOT_STARTED"
  | "MONITOR_DISABLED"
  | "CLOCK_INVALID"
  | "ROUTE_BINDING_INVALID"
  | "ROUTE_EXPIRED"
  | "SOURCE_INVALID"
  | "FORMAL_SNAPSHOT_UNAVAILABLE"
  | "FORMAL_SNAPSHOT_INVALID"
  | "SCENIC_AREA_CHANGED"
  | "NETWORK_REVISION_CHANGED"
  | "OPERATIONAL_VERSION_CHANGED"
  | "REPLAN_RESULT_INVALID"
  | "NO_SAFE_DETERMINISTIC_ROUTE"
  | "CURRENT"
  | "OFFLINE_SNAPSHOT_CURRENT";

export type RouteOperationalMonitorDecision = {
  status: "CONTINUE" | "PAUSE_FOR_DETERMINISTIC_REPLAN" | "STOP_AND_ASK_STAFF";
  instructionState: "ACTIVE" | "PAUSED" | "STOPPED";
  reason: RouteOperationalMonitorReason;
  checkedAt: string;
  route: RouteOperationalMonitorRoute | null;
  snapshot: VerifiedRouteOperationalSnapshot | null;
  replanRequest: RouteOperationalReplanRequest | null;
  message: string;
};

export type RouteOperationalMonitorState = {
  isChecking: boolean;
  lastTrigger: RouteOperationalMonitorTrigger | null;
  lastCheckedAt: string | null;
  decision: RouteOperationalMonitorDecision;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const isText = (value: unknown, max = 500): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isId = (value: unknown): value is string => isText(value, 160) && ID_PATTERN.test(value);

const isRevision = (value: unknown): value is string => isText(value, 100);

const isPositiveRevision = (value: unknown): value is number =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value >= 1
  && value <= Number.MAX_SAFE_INTEGER;

const isIsoInstant = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(new Date(value).getTime());
};

const checkedAt = (now: Date) => Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString();

function stoppedDecision(
  reason: RouteOperationalMonitorReason,
  now: Date,
  message: string,
  route: RouteOperationalMonitorRoute | null = null,
): RouteOperationalMonitorDecision {
  return {
    status: "STOP_AND_ASK_STAFF",
    instructionState: "STOPPED",
    reason,
    checkedAt: checkedAt(now),
    route: route ? { ...route } : null,
    snapshot: null,
    replanRequest: null,
    message,
  };
}

/** Strictly parses the route-plan commitment used by the monitor. */
export function parseRouteOperationalMonitorRoute(value: unknown): RouteOperationalMonitorRoute | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["schemaVersion", "routeId", "scenicAreaId", "networkRevision", "operationalVersion", "expiresAt"])
    || value.schemaVersion !== 1
    || !isId(value.routeId)
    || !isId(value.scenicAreaId)
    || !isRevision(value.networkRevision)
    || !isPositiveRevision(value.operationalVersion)
    || !isIsoInstant(value.expiresAt)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    routeId: value.routeId,
    scenicAreaId: value.scenicAreaId,
    networkRevision: value.networkRevision,
    operationalVersion: value.operationalVersion,
    expiresAt: value.expiresAt,
  };
}

function parseMonitorSource(value: unknown): RouteOperationalMonitorSource | null {
  if (!isRecord(value) || !isText(value.kind, 40) || !isText(value.transport, 20)) return null;
  if (
    value.kind === "FORMAL_SNAPSHOT"
    && (value.transport === "ONLINE" || value.transport === "OFFLINE")
    && exactKeys(value, ["kind", "transport", "snapshot"])
  ) {
    return { kind: "FORMAL_SNAPSHOT", transport: value.transport, snapshot: value.snapshot };
  }
  if (
    value.kind === "UNAVAILABLE"
    && (value.transport === "ONLINE" || value.transport === "OFFLINE")
    && exactKeys(value, ["kind", "transport", "code"])
    && ["FORMAL_NETWORK_UNAVAILABLE", "NETWORK_REQUEST_FAILED", "OFFLINE_SNAPSHOT_MISSING"].includes(String(value.code))
  ) {
    return {
      kind: "UNAVAILABLE",
      transport: value.transport,
      code: value.code as RouteOperationalMonitorUnavailableCode,
    };
  }
  return null;
}

function parseReplanRequest(value: unknown): RouteOperationalReplanRequest | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "mode",
      "scenicAreaId",
      "expectedNetworkRevision",
      "expectedOperationalVersion",
      "supersedesRouteId",
      "reason",
    ])
    || value.mode !== "DETERMINISTIC_FORMAL_ROUTE"
    || !isId(value.scenicAreaId)
    || !isRevision(value.expectedNetworkRevision)
    || !isPositiveRevision(value.expectedOperationalVersion)
    || !isId(value.supersedesRouteId)
    || (value.reason !== "NETWORK_REVISION_CHANGED" && value.reason !== "OPERATIONAL_VERSION_CHANGED")
  ) {
    return null;
  }
  return {
    mode: "DETERMINISTIC_FORMAL_ROUTE",
    scenicAreaId: value.scenicAreaId,
    expectedNetworkRevision: value.expectedNetworkRevision,
    expectedOperationalVersion: value.expectedOperationalVersion,
    supersedesRouteId: value.supersedesRouteId,
    reason: value.reason,
  };
}

function parseDeterministicReplanOutcome(value: unknown): RouteOperationalDeterministicReplanOutcome | null {
  if (!isRecord(value) || !isText(value.kind, 50)) return null;
  if (value.kind === "DETERMINISTIC_ROUTE_AVAILABLE" && exactKeys(value, ["kind", "route", "snapshot"])) {
    return { kind: "DETERMINISTIC_ROUTE_AVAILABLE", route: value.route, snapshot: value.snapshot };
  }
  if (
    value.kind === "NO_SAFE_ROUTE"
    && exactKeys(value, ["kind", "code"])
    && (value.code === "FORMAL_NETWORK_UNAVAILABLE" || value.code === "ROUTE_UNAVAILABLE")
  ) {
    return { kind: "NO_SAFE_ROUTE", code: value.code };
  }
  return null;
}

function snapshotPayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (
    exactKeys(value, ["schemaVersion", "requestId", "snapshot"])
    && value.schemaVersion === 1
    && isText(value.requestId, 100)
  ) {
    return value.snapshot;
  }
  if (
    exactKeys(value, [
      "schemaVersion", "scenicAreaId", "packId", "packRevision", "snapshotRevision", "networkRevision",
      "operationalVersion", "publishedAt", "expiresAt", "routeNetwork", "operationalState",
    ])
    && value.schemaVersion === 1
    && isId(value.packId)
    && isPositiveRevision(value.packRevision)
  ) {
    return {
      schemaVersion: value.schemaVersion,
      scenicAreaId: value.scenicAreaId,
      snapshotRevision: value.snapshotRevision,
      networkRevision: value.networkRevision,
      operationalVersion: value.operationalVersion,
      publishedAt: value.publishedAt,
      expiresAt: value.expiresAt,
      routeNetwork: value.routeNetwork,
      operationalState: value.operationalState,
    };
  }
  return value;
}

/**
 * Validates a complete formal routing snapshot before using only its version
 * projection. Nested route-network and operational-state contracts are both
 * revalidated so a metadata-only or stale response cannot keep navigation on.
 */
export function parseVerifiedRouteOperationalSnapshot(
  value: unknown,
  now = new Date(),
): VerifiedRouteOperationalSnapshot | null {
  if (!Number.isFinite(now.getTime())) return null;
  const payload = snapshotPayload(value);
  if (
    !isRecord(payload)
    || !exactKeys(payload, [
      "schemaVersion",
      "scenicAreaId",
      "snapshotRevision",
      "networkRevision",
      "operationalVersion",
      "publishedAt",
      "expiresAt",
      "routeNetwork",
      "operationalState",
    ])
    || payload.schemaVersion !== 1
    || !isId(payload.scenicAreaId)
    || !isPositiveRevision(payload.snapshotRevision)
    || !isRevision(payload.networkRevision)
    || !isPositiveRevision(payload.operationalVersion)
    || !isIsoInstant(payload.publishedAt)
    || !isIsoInstant(payload.expiresAt)
  ) {
    return null;
  }

  const nowMs = now.getTime();
  const publishedAtMs = new Date(payload.publishedAt).getTime();
  const expiresAtMs = new Date(payload.expiresAt).getTime();
  if (publishedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS || expiresAtMs <= publishedAtMs || expiresAtMs <= nowMs) return null;

  try {
    const fullNetwork = parseRouteNetwork(payload.routeNetwork);
    const publishedNetwork = getSafePublishedNetwork(payload.routeNetwork, now, payload.scenicAreaId);
    if (
      !fullNetwork
      || !publishedNetwork
      || publishedNetwork.revision !== payload.networkRevision
      || publishedNetwork.scenicAreaId !== payload.scenicAreaId
    ) {
      return null;
    }
    const operationalState = getSafeRouteOperationalState(
      payload.operationalState,
      fullNetwork,
      now,
      payload.scenicAreaId,
    );
    if (
      !operationalState
      || operationalState.networkRevision !== payload.networkRevision
      || operationalState.operationalVersion !== payload.operationalVersion
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    schemaVersion: 1,
    scenicAreaId: payload.scenicAreaId,
    snapshotRevision: payload.snapshotRevision,
    networkRevision: payload.networkRevision,
    operationalVersion: payload.operationalVersion,
    publishedAt: payload.publishedAt,
    expiresAt: payload.expiresAt,
  };
}

/**
 * Page-visible, online-resume, manual and first-load checks are immediate.
 * Interval checks are due only after a full 15-second period.
 */
export function isRouteOperationalMonitorCheckDue(input: {
  trigger: RouteOperationalMonitorTrigger;
  now: Date;
  lastCheckedAt: Date | null;
}): boolean {
  if (!Number.isFinite(input.now.getTime())) return true;
  if (input.trigger !== "INTERVAL") return true;
  if (!input.lastCheckedAt || !Number.isFinite(input.lastCheckedAt.getTime())) return true;
  return input.now.getTime() - input.lastCheckedAt.getTime() >= ROUTE_OPERATION_MONITOR_INTERVAL_MS;
}

/** Safe initial state: no existing instruction may run before the first check. */
export function createRouteOperationalMonitorInitialState(now = new Date()): RouteOperationalMonitorState {
  return {
    isChecking: false,
    lastTrigger: null,
    lastCheckedAt: null,
    decision: stoppedDecision(
      "MONITOR_NOT_STARTED",
      now,
      "尚未取得当前正式路网与运营状态，导航保持停止。请查看现场标识并向工作人员求助。",
    ),
  };
}

/** Safe disabled state used when a visit session is not active. */
export function createRouteOperationalMonitorDisabledDecision(now = new Date()): RouteOperationalMonitorDecision {
  return stoppedDecision(
    "MONITOR_DISABLED",
    now,
    "当前游览会话未启用运营监控，导航保持停止。请查看现场标识并向工作人员求助。",
  );
}

/**
 * Compares a route plan's immutable version commitment against one formal,
 * current snapshot. A changed version pauses old instructions immediately and
 * returns only a deterministic formal-replan request. Missing, malformed or
 * expired state stops navigation and tells the caller to surface human help.
 */
export function evaluateRouteOperationalMonitor(value: unknown, now = new Date()): RouteOperationalMonitorDecision {
  if (!Number.isFinite(now.getTime())) {
    return stoppedDecision(
      "CLOCK_INVALID",
      now,
      "设备时间无效，无法确认封路状态。导航已停止，请查看现场标识并向工作人员求助。",
    );
  }
  if (!isRecord(value) || !exactKeys(value, ["route", "source"])) {
    return stoppedDecision(
      "SOURCE_INVALID",
      now,
      "路线运营校验输入不完整，导航已停止。请查看现场标识并向工作人员求助。",
    );
  }

  const route = parseRouteOperationalMonitorRoute(value.route);
  if (!route) {
    return stoppedDecision(
      "ROUTE_BINDING_INVALID",
      now,
      "路线没有可核验的正式版本承诺，导航已停止。请查看现场标识并向工作人员求助。",
    );
  }
  if (new Date(route.expiresAt).getTime() <= now.getTime()) {
    return stoppedDecision(
      "ROUTE_EXPIRED",
      now,
      "当前路线或封路状态已过期，导航已停止。请查看现场标识并向工作人员求助。",
      route,
    );
  }

  const source = parseMonitorSource(value.source);
  if (!source) {
    return stoppedDecision(
      "SOURCE_INVALID",
      now,
      "路线运营状态来源不符合正式接口约束，导航已停止。请查看现场标识并向工作人员求助。",
      route,
    );
  }
  if (source.kind === "UNAVAILABLE") {
    return stoppedDecision(
      "FORMAL_SNAPSHOT_UNAVAILABLE",
      now,
      "当前正式路网或封路状态不可用，导航已停止。请按现场标识行动，并向工作人员求助。",
      route,
    );
  }

  const snapshot = parseVerifiedRouteOperationalSnapshot(source.snapshot, now);
  if (!snapshot) {
    return stoppedDecision(
      "FORMAL_SNAPSHOT_INVALID",
      now,
      "当前正式路网或封路状态无效或已过期，导航已停止。请按现场标识行动，并向工作人员求助。",
      route,
    );
  }
  if (snapshot.scenicAreaId !== route.scenicAreaId) {
    return stoppedDecision(
      "SCENIC_AREA_CHANGED",
      now,
      "返回的正式运营状态不属于当前景区，导航已停止。请查看现场标识并向工作人员求助。",
      route,
    );
  }
  if (snapshot.networkRevision !== route.networkRevision) {
    return {
      status: "PAUSE_FOR_DETERMINISTIC_REPLAN",
      instructionState: "PAUSED",
      reason: "NETWORK_REVISION_CHANGED",
      checkedAt: checkedAt(now),
      route: { ...route },
      snapshot: { ...snapshot },
      replanRequest: {
        mode: "DETERMINISTIC_FORMAL_ROUTE",
        scenicAreaId: route.scenicAreaId,
        expectedNetworkRevision: snapshot.networkRevision,
        expectedOperationalVersion: snapshot.operationalVersion,
        supersedesRouteId: route.routeId,
        reason: "NETWORK_REVISION_CHANGED",
      },
      message: "正式路网版本已变化，旧导航指令已暂停。请仅使用当前正式路网进行确定性重新规划；完成前请查看现场标识。",
    };
  }
  if (snapshot.operationalVersion !== route.operationalVersion) {
    return {
      status: "PAUSE_FOR_DETERMINISTIC_REPLAN",
      instructionState: "PAUSED",
      reason: "OPERATIONAL_VERSION_CHANGED",
      checkedAt: checkedAt(now),
      route: { ...route },
      snapshot: { ...snapshot },
      replanRequest: {
        mode: "DETERMINISTIC_FORMAL_ROUTE",
        scenicAreaId: route.scenicAreaId,
        expectedNetworkRevision: snapshot.networkRevision,
        expectedOperationalVersion: snapshot.operationalVersion,
        supersedesRouteId: route.routeId,
        reason: "OPERATIONAL_VERSION_CHANGED",
      },
      message: "封路或运营状态版本已变化，旧导航指令已暂停。请仅使用当前正式路网进行确定性重新规划；完成前请查看现场标识。",
    };
  }

  const offline = source.transport === "OFFLINE";
  return {
    status: "CONTINUE",
    instructionState: "ACTIVE",
    reason: offline ? "OFFLINE_SNAPSHOT_CURRENT" : "CURRENT",
    checkedAt: checkedAt(now),
    route: { ...route },
    snapshot: { ...snapshot },
    replanRequest: null,
    message: offline
      ? `设备当前离线，仅可在已核验运营状态有效至 ${snapshot.expiresAt} 前继续显示这条正式路线；到期会立即停止，请留意现场标识。`
      : "当前正式路网与封路状态仍与路线版本一致。",
  };
}

/**
 * Resolves the hand-off after a paused route is deterministically replanned.
 * A missing safe alternative is terminal: the old route remains stopped and
 * the caller must present the explicit human-help state instead of resuming or
 * falling back to a candidate/provider route.
 */
export function evaluateDeterministicRouteOperationalReplan(
  requestValue: unknown,
  outcomeValue: unknown,
  now = new Date(),
): RouteOperationalMonitorDecision {
  if (!Number.isFinite(now.getTime())) {
    return stoppedDecision(
      "CLOCK_INVALID",
      now,
      "设备时间无效，无法确认重新规划结果。导航已停止，请查看现场标识并向工作人员求助。",
    );
  }
  const request = parseReplanRequest(requestValue);
  if (!request) {
    return stoppedDecision(
      "REPLAN_RESULT_INVALID",
      now,
      "重新规划请求不符合正式版本约束，导航已停止。请查看现场标识并向工作人员求助。",
    );
  }
  const outcome = parseDeterministicReplanOutcome(outcomeValue);
  if (!outcome) {
    return stoppedDecision(
      "REPLAN_RESULT_INVALID",
      now,
      "重新规划结果不符合确定性正式路网约束，导航已停止。请查看现场标识并向工作人员求助。",
    );
  }
  if (outcome.kind === "NO_SAFE_ROUTE") {
    return stoppedDecision(
      "NO_SAFE_DETERMINISTIC_ROUTE",
      now,
      "当前没有可安全使用的正式替代路线，导航已停止。请按现场标识行动，并向工作人员求助。",
    );
  }

  const route = parseRouteOperationalMonitorRoute(outcome.route);
  if (
    !route
    || route.routeId === request.supersedesRouteId
    || route.scenicAreaId !== request.scenicAreaId
    || route.networkRevision !== request.expectedNetworkRevision
    || route.operationalVersion !== request.expectedOperationalVersion
  ) {
    return stoppedDecision(
      "REPLAN_RESULT_INVALID",
      now,
      "重新规划没有生成匹配当前正式版本的新路线，导航已停止。请查看现场标识并向工作人员求助。",
    );
  }

  return evaluateRouteOperationalMonitor({
    route,
    source: { kind: "FORMAL_SNAPSHOT", transport: "ONLINE", snapshot: outcome.snapshot },
  }, now);
}
