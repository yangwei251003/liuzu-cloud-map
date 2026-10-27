import { parseRouteNetwork, type RouteNetworkManifest } from "./route-network";

/**
 * A complete, short-lived operating-state snapshot for one published route
 * network. It is deliberately separate from the static GIS revision: an
 * operations change can close an edge without silently editing geometries.
 */
export type RouteOperationalEdgeStatus = "OPEN" | "CLOSED" | "RESTRICTED" | "UNKNOWN";

export type RouteOperationalEdgeState = {
  edgeId: string;
  status: RouteOperationalEdgeStatus;
  checkedAt: string;
  expiresAt: string;
  sourceReference: string;
  responsibleParty: string;
  /** Current, source-backed travel-time inputs. Missing on legacy snapshots. */
  routing?: {
    travelTimeMultiplier: number;
    crowdLevel: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
    weatherImpact: "NONE" | "RAIN" | "HEAT" | "WIND" | "MULTIPLE" | "UNKNOWN";
  };
};

export type RouteOperationalState = {
  schemaVersion: 1;
  scenicAreaId: string;
  networkRevision: string;
  operationalVersion: number;
  issuedAt: string;
  expiresAt: string;
  sourceReference: string;
  responsibleParty: string;
  edgeStates: RouteOperationalEdgeState[];
};

export type RouteOperationalStateValidationIssue = {
  code:
    | "CLOCK_INVALID"
    | "SCHEMA_INVALID"
    | "NETWORK_INVALID"
    | "SCENIC_AREA_MISMATCH"
    | "NETWORK_REVISION_MISMATCH"
    | "STATE_EXPIRED"
    | "TIME_INVALID"
    | "EDGE_STATE_DUPLICATE"
    | "EDGE_STATE_UNKNOWN"
    | "EDGE_STATE_MISSING"
    | "EDGE_STATE_EXPIRED";
  path: string;
  message: string;
};

export type RouteOperationalStateValidationResult = {
  status: "VALID" | "BLOCKED";
  checkedAt: string;
  state: RouteOperationalState | null;
  issues: RouteOperationalStateValidationIssue[];
};

type UnknownRecord = Record<string, unknown>;

const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_EDGE_STATES = 50_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const isText = (value: unknown, max = 500): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isId = (value: unknown): value is string => isText(value, 100) && ID_PATTERN.test(value);

const isIsoInstant = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
};

function parseEdgeState(value: unknown): RouteOperationalEdgeState | null {
  const baseKeys = ["edgeId", "status", "checkedAt", "expiresAt", "sourceReference", "responsibleParty"];
  const hasRouting = isRecord(value) && Object.hasOwn(value, "routing");
  if (
    !isRecord(value)
    || !exactKeys(value, hasRouting ? [...baseKeys, "routing"] : baseKeys)
    || !isId(value.edgeId)
    || !["OPEN", "CLOSED", "RESTRICTED", "UNKNOWN"].includes(String(value.status))
    || !isIsoInstant(value.checkedAt)
    || !isIsoInstant(value.expiresAt)
    || !isText(value.sourceReference)
    || !isText(value.responsibleParty, 200)
    || (hasRouting && !parseOperationalRouting(value.routing))
  ) {
    return null;
  }
  return structuredClone(value as RouteOperationalEdgeState);
}

function parseOperationalRouting(value: unknown): NonNullable<RouteOperationalEdgeState["routing"]> | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ["travelTimeMultiplier", "crowdLevel", "weatherImpact"])
    || typeof value.travelTimeMultiplier !== "number"
    || !Number.isFinite(value.travelTimeMultiplier)
    || value.travelTimeMultiplier < 0.5
    || value.travelTimeMultiplier > 5
    || !["LOW", "MODERATE", "HIGH", "UNKNOWN"].includes(String(value.crowdLevel))
    || !["NONE", "RAIN", "HEAT", "WIND", "MULTIPLE", "UNKNOWN"].includes(String(value.weatherImpact))
  ) {
    return null;
  }
  return value as NonNullable<RouteOperationalEdgeState["routing"]>;
}

/** Parses only the exact operational-state exchange contract. */
export function parseRouteOperationalState(value: unknown): RouteOperationalState | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "schemaVersion",
      "scenicAreaId",
      "networkRevision",
      "operationalVersion",
      "issuedAt",
      "expiresAt",
      "sourceReference",
      "responsibleParty",
      "edgeStates",
    ])
    || value.schemaVersion !== 1
    || !isId(value.scenicAreaId)
    || !isText(value.networkRevision, 100)
    || !Number.isSafeInteger(value.operationalVersion)
    || (value.operationalVersion as number) < 1
    || (value.operationalVersion as number) > Number.MAX_SAFE_INTEGER
    || !isIsoInstant(value.issuedAt)
    || !isIsoInstant(value.expiresAt)
    || !isText(value.sourceReference)
    || !isText(value.responsibleParty, 200)
    || !Array.isArray(value.edgeStates)
    || value.edgeStates.length > MAX_EDGE_STATES
  ) {
    return null;
  }

  const edgeStates = value.edgeStates.map(parseEdgeState);
  if (edgeStates.some((item) => item === null)) return null;
  return structuredClone({ ...value, edgeStates: edgeStates as RouteOperationalEdgeState[] } as RouteOperationalState);
}

/**
 * Validates that an operating-state snapshot covers every edge in precisely one
 * route-network revision. `UNKNOWN` is a valid reported state, but consumers
 * must treat that individual edge as non-routable.
 */
export function validateRouteOperationalState(
  value: unknown,
  networkValue: unknown,
  now = new Date(),
  expectedScenicAreaId?: string,
): RouteOperationalStateValidationResult {
  if (Number.isNaN(now.getTime())) {
    return {
      status: "BLOCKED",
      checkedAt: new Date(0).toISOString(),
      state: null,
      issues: [{ code: "CLOCK_INVALID", path: "$now", message: "校验时钟无效，运营状态已失败关闭。" }],
    };
  }

  const checkedAt = now.toISOString();
  const state = parseRouteOperationalState(value);
  if (!state) {
    return {
      status: "BLOCKED",
      checkedAt,
      state: null,
      issues: [{ code: "SCHEMA_INVALID", path: "$", message: "运营状态不符合严格 schema，已拒绝加载。" }],
    };
  }

  const network = parseRouteNetwork(networkValue);
  if (!network) {
    return {
      status: "BLOCKED",
      checkedAt,
      state: null,
      issues: [{ code: "NETWORK_INVALID", path: "$network", message: "关联路网不符合严格 schema，无法校验运营状态。" }],
    };
  }

  return validateParsedRouteOperationalState(state, network, now, expectedScenicAreaId);
}

function validateParsedRouteOperationalState(
  state: RouteOperationalState,
  network: RouteNetworkManifest,
  now: Date,
  expectedScenicAreaId?: string,
): RouteOperationalStateValidationResult {
  const checkedAt = now.toISOString();
  const nowMs = now.getTime();
  const issues: RouteOperationalStateValidationIssue[] = [];
  const issuedAtMs = new Date(state.issuedAt).getTime();
  const expiresAtMs = new Date(state.expiresAt).getTime();

  if (expectedScenicAreaId && state.scenicAreaId !== expectedScenicAreaId) {
    issues.push({ code: "SCENIC_AREA_MISMATCH", path: "scenicAreaId", message: `运营状态属于 ${state.scenicAreaId}，不能用于 ${expectedScenicAreaId}。` });
  }
  if (state.scenicAreaId !== network.scenicAreaId) {
    issues.push({ code: "SCENIC_AREA_MISMATCH", path: "scenicAreaId", message: "运营状态与路网所属景区不一致。" });
  }
  if (state.networkRevision !== network.revision) {
    issues.push({ code: "NETWORK_REVISION_MISMATCH", path: "networkRevision", message: "运营状态没有绑定当前路网 revision。" });
  }
  if (issuedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS || expiresAtMs <= issuedAtMs) {
    issues.push({ code: "TIME_INVALID", path: "issuedAt", message: "运营状态的签发时间或有效期无效。" });
  }
  if (expiresAtMs <= nowMs) {
    issues.push({ code: "STATE_EXPIRED", path: "expiresAt", message: "运营状态已过期，不能继续使用旧路线。" });
  }

  const networkEdgeIds = new Set(network.edges.map((edge) => edge.id));
  const seenEdgeIds = new Set<string>();
  for (const [index, edgeState] of state.edgeStates.entries()) {
    const checkedMs = new Date(edgeState.checkedAt).getTime();
    const edgeExpiresMs = new Date(edgeState.expiresAt).getTime();
    if (seenEdgeIds.has(edgeState.edgeId)) {
      issues.push({ code: "EDGE_STATE_DUPLICATE", path: `edgeStates.${index}.edgeId`, message: `${edgeState.edgeId} 的运营状态重复。` });
    }
    seenEdgeIds.add(edgeState.edgeId);
    if (!networkEdgeIds.has(edgeState.edgeId)) {
      issues.push({ code: "EDGE_STATE_UNKNOWN", path: `edgeStates.${index}.edgeId`, message: `${edgeState.edgeId} 不属于当前路网。` });
    }
    if (checkedMs > nowMs + FUTURE_CLOCK_SKEW_MS || edgeExpiresMs <= checkedMs) {
      issues.push({ code: "TIME_INVALID", path: `edgeStates.${index}`, message: `${edgeState.edgeId} 的状态时间无效。` });
    }
    if (edgeExpiresMs <= nowMs || edgeExpiresMs < expiresAtMs) {
      issues.push({ code: "EDGE_STATE_EXPIRED", path: `edgeStates.${index}.expiresAt`, message: `${edgeState.edgeId} 的状态未覆盖本次运营快照有效期。` });
    }
  }

  for (const edgeId of networkEdgeIds) {
    if (!seenEdgeIds.has(edgeId)) {
      issues.push({ code: "EDGE_STATE_MISSING", path: "edgeStates", message: `路网边 ${edgeId} 缺少运营状态，已失败关闭。` });
    }
  }

  return {
    status: issues.length ? "BLOCKED" : "VALID",
    checkedAt,
    state: structuredClone(state),
    issues,
  };
}

/** Returns a detached state only when it is current and fully covers the network. */
export function getSafeRouteOperationalState(
  value: unknown,
  networkValue: unknown,
  now = new Date(),
  expectedScenicAreaId?: string,
): RouteOperationalState | null {
  const result = validateRouteOperationalState(value, networkValue, now, expectedScenicAreaId);
  return result.status === "VALID" && result.state ? structuredClone(result.state) : null;
}
