import {
  parseRouteNetwork,
  validateRouteNetwork,
  type RouteNetworkEdge,
  type RouteNetworkManifest,
} from "./route-network";

export const ROUTE_DISRUPTION_MAX_ACCURACY_METERS = 50;
export const ROUTE_DISRUPTION_MAX_POSITION_AGE_MS = 30_000;

export type RouteDisruptionAction =
  | "STOP_AND_VERIFY"
  | "ASK_STAFF"
  | "REPLAN_REQUIRED"
  | "CONTINUE";

export type PublishedRouteSnapshot = {
  schemaVersion: 1;
  routePlanId: string;
  routeRevision: number;
  scenicAreaId: string;
  networkRevision: string;
  trustStatus: "PUBLISHED_VALIDATED" | "UNVERIFIED_PROTOTYPE" | "STALE" | "UNKNOWN";
  validatedAt: string;
  expiresAt: string;
  edgeIds: string[];
  currentEdgeId: string;
  corridorMeters: number;
};

export type RouteDisruptionPosition = {
  longitude: number;
  latitude: number;
  coordinateSystem: "WGS84";
  accuracyMeters: number;
  observedAt: string;
};

export type RouteDisruptionDecision = {
  action: RouteDisruptionAction;
  canContinue: boolean;
  code:
    | "INPUT_INVALID"
    | "NETWORK_UNAVAILABLE"
    | "NETWORK_STATUS_EXPIRED"
    | "ROUTE_UNTRUSTED"
    | "ROUTE_REVISION_STALE"
    | "ROUTE_EDGE_MISSING"
    | "CURRENT_EDGE_CLOSED"
    | "CURRENT_EDGE_RESTRICTED"
    | "ROUTE_AHEAD_BLOCKED"
    | "EDGE_STATUS_UNKNOWN"
    | "POSITION_UNRELIABLE"
    | "POSITION_AMBIGUOUS"
    | "OFF_PUBLISHED_CORRIDOR"
    | "ON_PUBLISHED_CORRIDOR";
  checkedAt: string;
  currentEdgeId: string | null;
  offsetMeters: number | null;
  corridorMeters: number | null;
  message: string;
  safetyNotice: string;
};

type UnknownRecord = Record<string, unknown>;

const FUTURE_CLOCK_SKEW_MS = 5_000;
const MAX_ROUTE_EDGES = 2_000;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NO_REPLAN_NOTICE = "本判定不会生成捷径，也不表示已经完成现场重算或找到安全绕行；现场标识与工作人员指引优先。";

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: UnknownRecord, expected: string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const isText = (value: unknown, max = 100): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isId = (value: unknown): value is string => isText(value) && ID_PATTERN.test(value);

const isIsoInstant = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const inRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

export function parsePublishedRouteSnapshot(value: unknown): PublishedRouteSnapshot | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["schemaVersion", "routePlanId", "routeRevision", "scenicAreaId", "networkRevision", "trustStatus", "validatedAt", "expiresAt", "edgeIds", "currentEdgeId", "corridorMeters"]) ||
    value.schemaVersion !== 1 ||
    !isId(value.routePlanId) ||
    !Number.isSafeInteger(value.routeRevision) ||
    (value.routeRevision as number) < 1 ||
    !isId(value.scenicAreaId) ||
    !isText(value.networkRevision) ||
    !["PUBLISHED_VALIDATED", "UNVERIFIED_PROTOTYPE", "STALE", "UNKNOWN"].includes(String(value.trustStatus)) ||
    !isIsoInstant(value.validatedAt) ||
    !isIsoInstant(value.expiresAt) ||
    !Array.isArray(value.edgeIds) ||
    value.edgeIds.length < 1 ||
    value.edgeIds.length > MAX_ROUTE_EDGES ||
    !value.edgeIds.every(isId) ||
    new Set(value.edgeIds).size !== value.edgeIds.length ||
    !isId(value.currentEdgeId) ||
    !inRange(value.corridorMeters, 5, 200)
  ) {
    return null;
  }
  return structuredClone(value as PublishedRouteSnapshot);
}

export function parseRouteDisruptionPosition(value: unknown): RouteDisruptionPosition | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["longitude", "latitude", "coordinateSystem", "accuracyMeters", "observedAt"]) ||
    !inRange(value.longitude, -180, 180) ||
    !inRange(value.latitude, -90, 90) ||
    value.coordinateSystem !== "WGS84" ||
    !inRange(value.accuracyMeters, 0.1, 10_000) ||
    !isIsoInstant(value.observedAt)
  ) {
    return null;
  }
  return structuredClone(value as RouteDisruptionPosition);
}

function decision(
  input: Omit<RouteDisruptionDecision, "canContinue" | "safetyNotice">,
): RouteDisruptionDecision {
  return {
    ...input,
    canContinue: input.action === "CONTINUE",
    safetyNotice: NO_REPLAN_NOTICE,
  };
}

function distanceToSegmentMeters(
  position: RouteDisruptionPosition,
  start: [number, number],
  end: [number, number],
) {
  const earthRadiusMeters = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeOrigin = position.latitude * radians;
  const project = ([longitude, latitude]: [number, number]) => ({
    x: (longitude - position.longitude) * radians * earthRadiusMeters * Math.cos(latitudeOrigin),
    y: (latitude - position.latitude) * radians * earthRadiusMeters,
  });
  const from = project(start);
  const to = project(end);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(from.x * dx + from.y * dy) / lengthSquared));
  return Math.hypot(from.x + fraction * dx, from.y + fraction * dy);
}

export function distanceToPublishedEdgeMeters(
  position: RouteDisruptionPosition,
  edge: Pick<RouteNetworkEdge, "geometry">,
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < edge.geometry.coordinates.length - 1; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegmentMeters(position, edge.geometry.coordinates[index], edge.geometry.coordinates[index + 1]),
    );
  }
  return minimum;
}

function currentRouteEdges(route: PublishedRouteSnapshot, network: RouteNetworkManifest) {
  const byId = new Map(network.edges.map((edge) => [edge.id, edge]));
  return route.edgeIds.map((edgeId) => byId.get(edgeId));
}

/**
 * Deterministic, fail-closed decision for an already-published route. It never
 * calculates a replacement path and never promotes prototype data.
 */
export function evaluateRouteDisruption(
  value: unknown,
  now = new Date(),
  expectedScenicAreaId = "liuzu-town",
): RouteDisruptionDecision {
  const invalidClock = Number.isNaN(now.getTime());
  const checkedAt = invalidClock ? new Date(0).toISOString() : now.toISOString();
  const base = { checkedAt, currentEdgeId: null, offsetMeters: null, corridorMeters: null };
  if (invalidClock || !isRecord(value) || !exactKeys(value, ["network", "route", "position"])) {
    return decision({ ...base, action: "STOP_AND_VERIFY", code: "INPUT_INVALID", message: "安全判定输入或校验时钟无效，请停止自动导览并查看现场标识。" });
  }

  if (value.network === null || value.network === undefined) {
    return decision({ ...base, action: "STOP_AND_VERIFY", code: "NETWORK_UNAVAILABLE", message: "当前没有可用的正式路网，无法确认这一步是否仍可通行，请停下核验并询问现场人员。" });
  }

  const route = parsePublishedRouteSnapshot(value.route);
  const position = parseRouteDisruptionPosition(value.position);
  if (!route || !position) {
    return decision({ ...base, action: "STOP_AND_VERIFY", code: "INPUT_INVALID", message: "路线快照或定位数据不符合严格格式，旧的继续提示已停止。" });
  }

  const routeBase = { ...base, currentEdgeId: route.currentEdgeId, corridorMeters: route.corridorMeters };
  const parsedNetwork = parseRouteNetwork(value.network);
  if (!parsedNetwork) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "NETWORK_UNAVAILABLE", message: "正式路网数据无法通过完整性校验，请停止自动导览并查看现场标识。" });
  }

  const networkCheck = validateRouteNetwork(parsedNetwork, now, expectedScenicAreaId);
  if (networkCheck.issues.some(({ code }) => code === "STATUS_EXPIRED")) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "NETWORK_STATUS_EXPIRED", message: "路网中有动态通行状态已过期，当前无法确认道路是否仍开放。" });
  }
  const tolerableNetworkIssueCodes = new Set(["NO_OPEN_CROSS_LAYER_CONNECTION"]);
  if (networkCheck.issues.some(({ code }) => !tolerableNetworkIssueCodes.has(code))) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "NETWORK_UNAVAILABLE", message: "正式路网的来源、权利、审核、入口或拓扑已失效，请停止自动导览。" });
  }

  const nowMs = now.getTime();
  const validatedAtMs = new Date(route.validatedAt).getTime();
  const expiresAtMs = new Date(route.expiresAt).getTime();
  if (route.trustStatus !== "PUBLISHED_VALIDATED") {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_UNTRUSTED", message: "当前路线不是已发布且已校验的路线，必须重新校验后才能继续。" });
  }
  if (
    route.scenicAreaId !== expectedScenicAreaId ||
    route.scenicAreaId !== parsedNetwork.scenicAreaId ||
    route.networkRevision !== parsedNetwork.revision ||
    validatedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS ||
    expiresAtMs <= nowMs ||
    (parsedNetwork.publishedAt !== null && validatedAtMs < new Date(parsedNetwork.publishedAt).getTime()) ||
    expiresAtMs <= validatedAtMs
  ) {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_REVISION_STALE", message: "路线绑定的景区、路网 revision 或有效期已变化，旧路线必须重新校验。" });
  }
  if (!route.edgeIds.includes(route.currentEdgeId)) {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_EDGE_MISSING", message: "当前路段不属于已校验路线，不能沿用旧的路线步骤。" });
  }

  const routeEdges = currentRouteEdges(route, parsedNetwork);
  if (routeEdges.some((edge) => edge === undefined)) {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_EDGE_MISSING", message: "路线引用的发布路段已经不存在，必须重新校验路线。" });
  }
  const currentEdge = parsedNetwork.edges.find((edge) => edge.id === route.currentEdgeId);
  if (!currentEdge) {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_EDGE_MISSING", message: "当前发布路段已经不存在，必须重新校验路线。" });
  }

  if (currentEdge.dynamicStatus.status === "CLOSED") {
    return decision({ ...routeBase, action: "ASK_STAFF", code: "CURRENT_EDGE_CLOSED", message: "当前路段已确认封闭，请停止前进、查看现场标识并询问工作人员；系统不会猜测捷径。" });
  }
  if (currentEdge.dynamicStatus.status === "RESTRICTED") {
    return decision({ ...routeBase, action: "ASK_STAFF", code: "CURRENT_EDGE_RESTRICTED", message: "当前路段处于受限通行状态，请停止自动导览并向现场工作人员确认能否通行。" });
  }
  if (currentEdge.dynamicStatus.status === "UNKNOWN") {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "EDGE_STATUS_UNKNOWN", message: "当前路段的通行状态无法核验，请勿按旧提示继续。" });
  }

  const blockedAhead = routeEdges.find((edge) => edge && edge.id !== currentEdge.id && (edge.dynamicStatus.status === "CLOSED" || edge.dynamicStatus.status === "RESTRICTED"));
  if (blockedAhead) {
    return decision({ ...routeBase, action: "REPLAN_REQUIRED", code: "ROUTE_AHEAD_BLOCKED", message: `后续路段“${blockedAhead.id}”已关闭或受限，当前路线必须重新校验；系统不会自动生成绕行。` });
  }
  if (routeEdges.some((edge) => edge?.dynamicStatus.status === "UNKNOWN")) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "EDGE_STATUS_UNKNOWN", message: "路线中有路段状态无法核验，请停止沿用旧路线并向现场人员确认。" });
  }

  const observedAtMs = new Date(position.observedAt).getTime();
  if (
    position.accuracyMeters > ROUTE_DISRUPTION_MAX_ACCURACY_METERS ||
    observedAtMs > nowMs + FUTURE_CLOCK_SKEW_MS ||
    nowMs - observedAtMs > ROUTE_DISRUPTION_MAX_POSITION_AGE_MS
  ) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "POSITION_UNRELIABLE", message: "定位精度不足或位置已经过时，无法可靠判断是否仍在发布路线走廊内。" });
  }

  const offsetMeters = distanceToPublishedEdgeMeters(position, currentEdge);
  const positionBase = { ...routeBase, offsetMeters };
  if (!Number.isFinite(offsetMeters)) {
    return decision({ ...routeBase, action: "STOP_AND_VERIFY", code: "POSITION_UNRELIABLE", message: "无法计算当前位置与发布路段的关系，请停止自动导览。" });
  }
  if (offsetMeters - position.accuracyMeters > route.corridorMeters) {
    return decision({ ...positionBase, action: "ASK_STAFF", code: "OFF_PUBLISHED_CORRIDOR", message: "定位误差范围已完全落在发布路线走廊之外，可能已经偏航；请停下并向现场工作人员确认。" });
  }
  if (offsetMeters + position.accuracyMeters > route.corridorMeters) {
    return decision({ ...positionBase, action: "STOP_AND_VERIFY", code: "POSITION_AMBIGUOUS", message: "当前位置误差范围与发布路线走廊边界重叠，暂时不能确认仍在路线内。" });
  }

  return decision({ ...positionBase, action: "CONTINUE", code: "ON_PUBLISHED_CORRIDOR", message: "当前证据仅支持继续查看已发布且状态为开放的当前路段步骤；请持续以现场标识为准。" });
}
