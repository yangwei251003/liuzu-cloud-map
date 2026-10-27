import { readBoundedJson } from "./bounded-json";
import type { AdminRole } from "./admin-oidc-rbac-domain";
import {
  activateRouteClosure,
  readRouteOperationsOverview,
  reviewRouteClosure,
  type RouteOperationsActor,
  type RouteOperationsRepository,
} from "./route-operations-service";

const ROUTE_OPERATIONS_BODY_LIMIT_BYTES = 16_384;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type RouteOperationsAuthorization =
  | { state: "AUTHORIZED"; actor: RouteOperationsActor }
  | { state: "UNAVAILABLE" | "DENIED" };

export type RouteOperationsHttpDependencies = {
  repository: RouteOperationsRepository;
  authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[]): Promise<RouteOperationsAuthorization>;
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

async function readInput(request: Request, requestId: string) {
  const body = await readBoundedJson(request, ROUTE_OPERATIONS_BODY_LIMIT_BYTES);
  if (body.ok) return body;
  if (body.code === "INVALID_CONTENT_TYPE") return { response: error(requestId, body.code, "请使用 JSON 请求。", 415) };
  if (body.code === "PAYLOAD_TOO_LARGE") return { response: error(requestId, body.code, "道路管制请求超过 16 KB。", 413) };
  return { response: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
}

async function authorize(
  request: Request,
  scenicAreaId: string,
  roles: readonly AdminRole[],
  dependencies: RouteOperationsHttpDependencies,
  requestId: string,
) {
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId)) return { response: error(requestId, "INVALID_SCENIC_AREA", "景区标识无效。", 400) };
  const result = await dependencies.authorize(request, scenicAreaId, roles).catch(() => ({ state: "UNAVAILABLE" as const }));
  if (result.state === "AUTHORIZED") return result;
  return result.state === "UNAVAILABLE"
    ? { response: error(requestId, "ROUTE_OPERATIONS_UNAVAILABLE", "道路运营服务尚未完成真库、OIDC/MFA 与可信身份断言配置。", 503, true) }
    : { response: error(requestId, "ADMIN_AUTHORIZATION_DENIED", "当前管理员身份不能执行此操作。", 403) };
}

export async function handleReadRouteOperations(
  request: Request,
  scenicAreaId: string,
  dependencies: RouteOperationsHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOriginReadContext(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await readRouteOperationsOverview(dependencies.repository, auth.actor, dependencies.now?.() ?? new Date());
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, overview: result.overview }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "道路运营查询不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "道路运营数据暂不可用。", 503, true);
}

export async function handleActivateRouteClosure(
  request: Request,
  scenicAreaId: string,
  dependencies: RouteOperationsHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EMERGENCY"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await activateRouteClosure(
    dependencies.repository,
    body.value,
    auth.actor,
    request.headers.get("idempotency-key"),
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "CREATED" || result.state === "REPLAYED") {
    return json({ schemaVersion: 1, requestId, receipt: result.receipt }, result.state === "CREATED" ? 201 : 200, requestId);
  }
  if (result.state === "NO_CURRENT_NETWORK") return error(requestId, result.state, "当前没有可绑定的已发布、现场核验正式路网。", 409);
  if (result.state === "EDGE_NOT_CURRENT_OR_STALE") return error(requestId, result.state, "正式快照或路段已变化，请刷新后重新确认。", 409, true);
  if (result.state === "ACTIVE_EVENT_EXISTS") return error(requestId, result.state, "该路段在所选时段已有未撤回的管制事件。", 409);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "幂等键已用于另一项道路运营操作。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "管制类型、证据、有效期、快照版本或明确确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "道路管制暂无法写入；请按现场应急流程处置并联系值守人员。", 503, true);
}

export async function handleReviewRouteClosure(
  request: Request,
  scenicAreaId: string,
  closureEventId: string,
  dependencies: RouteOperationsHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await reviewRouteClosure(
    dependencies.repository,
    closureEventId,
    body.value,
    auth.actor,
    request.headers.get("idempotency-key"),
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "UPDATED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, 200, requestId);
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "道路管制事件不存在。", 404);
  if (result.state === "ACTIVATOR_CANNOT_REVIEW") return error(requestId, result.state, "管制发起人与独立复核人必须职责分离。", 403);
  if (result.state === "REVISION_CONFLICT" || result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "复核版本或幂等键已变化，请刷新后重试。", 409, true);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "复核决定、证据、版本或风险确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "道路管制复核存储暂不可用。", 503, true);
}
