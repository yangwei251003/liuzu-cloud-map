import { readBoundedJson } from "./bounded-json";
import type { AdminRole } from "./admin-oidc-rbac-domain";
import {
  prepareRouteOperationalRelease,
  publishRouteOperationalRelease,
  readRouteOperationalReleaseOverview,
  type RouteOperationalReleaseActor,
  type RouteOperationalReleaseRepository,
} from "./route-operational-release-service";

const BODY_LIMIT_BYTES = 16_384;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type RouteOperationalReleaseAuthorization =
  | { state: "AUTHORIZED"; actor: RouteOperationalReleaseActor }
  | { state: "UNAVAILABLE" | "DENIED" };

export type RouteOperationalReleaseHttpDependencies = {
  repository: RouteOperationalReleaseRepository;
  authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[]): Promise<RouteOperationalReleaseAuthorization>;
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

async function authorize(
  request: Request,
  scenicAreaId: string,
  roles: readonly AdminRole[],
  dependencies: RouteOperationalReleaseHttpDependencies,
  requestId: string,
) {
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId)) return { response: error(requestId, "INVALID_SCENIC_AREA", "景区标识无效。", 400) };
  const result = await dependencies.authorize(request, scenicAreaId, roles).catch(() => ({ state: "UNAVAILABLE" as const }));
  if (result.state === "AUTHORIZED") return result;
  return result.state === "UNAVAILABLE"
    ? { response: error(requestId, "ROUTE_OPERATIONAL_RELEASE_UNAVAILABLE", "运营快照发布尚未完成真库、OIDC/MFA、可信身份断言与显式开关配置。", 503, true) }
    : { response: error(requestId, "ADMIN_AUTHORIZATION_DENIED", "当前管理员身份不能执行此操作。", 403) };
}

async function readInput(request: Request, requestId: string) {
  const body = await readBoundedJson(request, BODY_LIMIT_BYTES);
  if (body.ok) return body;
  if (body.code === "INVALID_CONTENT_TYPE") return { response: error(requestId, body.code, "请使用 JSON 请求。", 415) };
  if (body.code === "PAYLOAD_TOO_LARGE") return { response: error(requestId, body.code, "运营快照请求超过 16 KB。", 413) };
  return { response: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
}

export async function handleReadRouteOperationalReleases(
  request: Request,
  scenicAreaId: string,
  dependencies: RouteOperationalReleaseHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOriginReadContext(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EMERGENCY", "RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await readRouteOperationalReleaseOverview(dependencies.repository, auth.actor, dependencies.now?.() ?? new Date());
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, overview: result.overview }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "运营快照查询不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "运营快照数据暂不可用。", 503, true);
}

export async function handlePrepareRouteOperationalRelease(
  request: Request,
  scenicAreaId: string,
  dependencies: RouteOperationalReleaseHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["OPERATIONS_EMERGENCY"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await prepareRouteOperationalRelease(dependencies.repository, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "CREATED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, result.state === "CREATED" ? 201 : 200, requestId);
  if (result.state === "NO_CURRENT_SNAPSHOT") return error(requestId, result.state, "当前没有满足许可、现场核验和有效期门禁的正式快照。", 409);
  if (result.state === "SNAPSHOT_CHANGED") return error(requestId, result.state, "正式快照已变化，请刷新后重新准备。", 409, true);
  if (result.state === "PENDING_EVENTS") return error(requestId, result.state, "仍有未完成独立复核的有效管制事件，不能编译替代快照。", 409);
  if (result.state === "PENDING_OBSERVATIONS") return error(requestId, result.state, "仍有未完成独立复核的客流或天气观测，不能编译替代快照。", 409);
  if (result.state === "NO_REVIEWED_SOURCES") return error(requestId, result.state, "没有可编译的已确认管制事件或已复核动态观测。", 409);
  if (result.state === "CANDIDATE_EXISTS") return error(requestId, result.state, "当前基础快照已有不可变替代候选，请先完成发布或等待其失效。", 409);
  if (result.state === "INSUFFICIENT_VALIDITY") return error(requestId, result.state, "快照或事件剩余有效期不足 10 分钟，不能创建新发布候选。", 409);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "幂等键已用于另一项运营快照操作。", 409);
  if (result.state === "SOURCE_SNAPSHOT_INVALID") return error(requestId, result.state, "正式快照、规范化路段或事件集合未通过完整性校验。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "准备请求、证据、版本或明确确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "运营快照候选暂无法写入。", 503, true);
}

export async function handlePublishRouteOperationalRelease(
  request: Request,
  scenicAreaId: string,
  releaseId: string,
  dependencies: RouteOperationalReleaseHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await publishRouteOperationalRelease(dependencies.repository, releaseId, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "PUBLISHED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, 200, requestId);
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "运营快照候选不存在。", 404);
  if (result.state === "PREPARER_CANNOT_PUBLISH") return error(requestId, result.state, "候选准备人与发布人必须使用不同的可信身份。", 403);
  if (result.state === "REVISION_CONFLICT" || result.state === "BASE_SNAPSHOT_CHANGED" || result.state === "CLOSURE_SET_CHANGED" || result.state === "OBSERVATION_SET_CHANGED" || result.state === "IDEMPOTENCY_CONFLICT") {
    return error(requestId, result.state, "基础快照、管制/观测集合、工作流版本或幂等键已变化，请刷新后重新核对。", 409, true);
  }
  if (result.state === "CANDIDATE_EXPIRED") return error(requestId, result.state, "运营快照候选已到期，不能发布。", 409);
  if (result.state === "SOURCE_SNAPSHOT_INVALID") return error(requestId, result.state, "候选快照未通过结构、版本、有效期或摘要复核。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "发布证据、版本或明确确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "运营快照发布暂不可用。", 503, true);
}
