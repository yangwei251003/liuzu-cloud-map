import { readBoundedJson } from "./bounded-json";
import type { AdminRole } from "./admin-oidc-rbac-domain";
import {
  readRouteOperationalObservationOverview,
  reviewRouteOperationalObservation,
  submitRouteOperationalObservation,
  type RouteOperationalObservationActor,
  type RouteOperationalObservationRepository,
} from "./route-operational-observation-service";

const BODY_LIMIT_BYTES = 16_384;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type RouteOperationalObservationAuthorization =
  | { state: "AUTHORIZED"; actor: RouteOperationalObservationActor }
  | { state: "UNAVAILABLE" | "DENIED" };

export type RouteOperationalObservationHttpDependencies = {
  repository: RouteOperationalObservationRepository;
  authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[]): Promise<RouteOperationalObservationAuthorization>;
  now?: () => Date;
};

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Request-Id": requestId,
    },
  });
}

function error(requestId: string, code: string, message: string, status: number, retryable = false) {
  return json({ requestId, error: { code, message, retryable } }, status, requestId);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function sameOriginReadContext(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null) return sameOrigin(request);
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

async function authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[], dependencies: RouteOperationalObservationHttpDependencies, requestId: string) {
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId)) return { response: error(requestId, "INVALID_SCENIC_AREA", "景区标识无效。", 400) };
  const result = await dependencies.authorize(request, scenicAreaId, roles).catch(() => ({ state: "UNAVAILABLE" as const }));
  if (result.state === "AUTHORIZED") return result;
  return result.state === "UNAVAILABLE"
    ? { response: error(requestId, "ROUTE_OPERATIONAL_OBSERVATIONS_UNAVAILABLE", "动态运营观测尚未完成真库、OIDC/MFA 与可信身份配置。", 503, true) }
    : { response: error(requestId, "ADMIN_AUTHORIZATION_DENIED", "当前管理员身份不能执行此操作。", 403) };
}

async function readInput(request: Request, requestId: string) {
  const body = await readBoundedJson(request, BODY_LIMIT_BYTES);
  if (body.ok) return body;
  if (body.code === "INVALID_CONTENT_TYPE") return { response: error(requestId, body.code, "请使用 JSON 请求。", 415) };
  if (body.code === "PAYLOAD_TOO_LARGE") return { response: error(requestId, body.code, "动态运营观测请求超过 16 KB。", 413) };
  return { response: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
}

export async function handleReadRouteOperationalObservations(request: Request, scenicAreaId: string, dependencies: RouteOperationalObservationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOriginReadContext(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EDITOR", "OPERATIONS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await readRouteOperationalObservationOverview(dependencies.repository, auth.actor, dependencies.now?.() ?? new Date());
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, overview: result.overview }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "动态运营观测查询不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "动态运营观测数据暂不可用。", 503, true);
}

export async function handleSubmitRouteOperationalObservation(request: Request, scenicAreaId: string, dependencies: RouteOperationalObservationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EDITOR"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await submitRouteOperationalObservation(dependencies.repository, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "CREATED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, result.state === "CREATED" ? 201 : 200, requestId);
  if (result.state === "NO_CURRENT_NETWORK") return error(requestId, result.state, "当前没有可绑定的正式路网。", 409);
  if (result.state === "EDGE_NOT_CURRENT_OR_STALE") return error(requestId, result.state, "正式快照或路段状态已变化，请刷新后重新核对。", 409, true);
  if (result.state === "ACTIVE_OBSERVATION_EXISTS") return error(requestId, result.state, "该路段已有待独立复核的动态观测。", 409);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "幂等键已用于另一项动态运营操作。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "拥堵、天气、倍率、证据、时间或快照版本不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "动态运营观测暂无法写入。", 503, true);
}

export async function handleReviewRouteOperationalObservation(request: Request, scenicAreaId: string, observationId: string, dependencies: RouteOperationalObservationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await reviewRouteOperationalObservation(dependencies.repository, observationId, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "UPDATED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, 200, requestId);
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "动态运营观测不存在。", 404);
  if (result.state === "SUBMITTER_CANNOT_REVIEW") return error(requestId, result.state, "观测提交人与独立复核人必须职责分离。", 403);
  if (result.state === "REVISION_CONFLICT" || result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "观测版本、有效期或幂等键已变化，请刷新后重试。", 409, true);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "复核决定、证据或版本不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "动态运营观测复核暂不可用。", 503, true);
}
