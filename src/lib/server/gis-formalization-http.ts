import { readBoundedJson } from "./bounded-json";
import type { AdminRole } from "./admin-oidc-rbac-domain";
import {
  prepareGisFormalization,
  publishGisFormalization,
  readGisFormalizationOverview,
  type GisFormalizationActor,
  type GisFormalizationRepository,
} from "./gis-formalization-service";

const BODY_LIMIT_BYTES = 65_536;
const SCENIC_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type GisFormalizationAuthorization =
  | { state: "AUTHORIZED"; actor: GisFormalizationActor }
  | { state: "UNAVAILABLE" | "DENIED" };

export type GisFormalizationHttpDependencies = {
  repository: GisFormalizationRepository;
  authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[]): Promise<GisFormalizationAuthorization>;
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
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function sameOriginRead(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null) return sameOrigin(request);
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

async function authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[], dependencies: GisFormalizationHttpDependencies, requestId: string) {
  if (!SCENIC_PATTERN.test(scenicAreaId)) return { response: error(requestId, "INVALID_SCENIC_AREA", "景区标识无效。", 400) };
  const result = await dependencies.authorize(request, scenicAreaId, roles).catch(() => ({ state: "UNAVAILABLE" as const }));
  if (result.state === "AUTHORIZED") return result;
  return result.state === "UNAVAILABLE"
    ? { response: error(requestId, "GIS_FORMALIZATION_UNAVAILABLE", "GIS 正式化尚未完成真库、OIDC/MFA、可信身份断言与显式开关配置。", 503, true) }
    : { response: error(requestId, "ADMIN_AUTHORIZATION_DENIED", "当前管理员身份不能执行此操作。", 403) };
}

async function readInput(request: Request, requestId: string) {
  const body = await readBoundedJson(request, BODY_LIMIT_BYTES);
  if (body.ok) return body;
  if (body.code === "INVALID_CONTENT_TYPE") return { response: error(requestId, body.code, "请使用 JSON 请求。", 415) };
  if (body.code === "PAYLOAD_TOO_LARGE") return { response: error(requestId, body.code, "GIS 正式化请求超过 64 KB。", 413) };
  return { response: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
}

export async function handleReadGisFormalizations(request: Request, scenicAreaId: string, dependencies: GisFormalizationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOriginRead(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["GIS_REVIEWER", "RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await readGisFormalizationOverview(dependencies.repository, auth.actor, dependencies.now?.() ?? new Date());
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, overview: result.overview }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "正式化查询不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "正式化队列暂不可用。", 503, true);
}

export async function handlePrepareGisFormalization(request: Request, scenicAreaId: string, dependencies: GisFormalizationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["GIS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await prepareGisFormalization(dependencies.repository, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "CREATED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, result.state === "CREATED" ? 201 : 200, requestId);
  if (result.state === "SUBMISSION_NOT_FOUND") return error(requestId, result.state, "待正式化提交不存在。", 404);
  if (result.state === "SUBMISSION_NOT_APPROVED" || result.state === "SOURCE_CHANGED") return error(requestId, result.state, "候选提交不再是完整、已审核且内容摘要一致的版本。", 409, true);
  if (result.state === "REVIEWER_CANNOT_PREPARE") return error(requestId, result.state, "专业审核人与正式化准备人必须使用不同身份。", 403);
  if (result.state === "CANDIDATE_EXISTS") return error(requestId, result.state, "该提交已经生成正式化候选。", 409);
  if (result.state === "PLAN_BLOCKED") return error(requestId, result.state, "路网分层、方向、入口连接、来源或有效期未满足正式化门禁。", 409);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "幂等键已用于另一项正式化操作。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "正式化字段、逐路段策略、证据或明确确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "正式化候选暂无法写入。", 503, true);
}

export async function handlePublishGisFormalization(request: Request, scenicAreaId: string, releaseId: string, dependencies: GisFormalizationHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["RELEASE_ADMIN"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await publishGisFormalization(dependencies.repository, releaseId, body.value, auth.actor, request.headers.get("idempotency-key"), dependencies.now?.() ?? new Date());
  if (result.state === "PUBLISHED" || result.state === "REPLAYED") return json({ schemaVersion: 1, requestId, receipt: result.receipt }, 200, requestId);
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "正式化候选不存在。", 404);
  if (result.state === "PREPARER_CANNOT_PUBLISH" || result.state === "DUTY_SEPARATION_FAILED") return error(requestId, result.state, "提交、审核、正式化准备与管理发布职责未充分分离。", 403);
  if (["REVISION_CONFLICT", "SOURCE_CHANGED", "IDEMPOTENCY_CONFLICT"].includes(result.state)) return error(requestId, result.state, "候选来源、工作流版本或幂等状态已变化，请刷新后重新核对。", 409, true);
  if (result.state === "CANDIDATE_EXPIRED") return error(requestId, result.state, "正式化候选或初始运营状态已到期。", 409);
  if (result.state === "ACTIVE_CLOSURES") return error(requestId, result.state, "当前正式路网仍有未撤回管制事件，不能用全开放新版本覆盖。", 409);
  if (result.state === "OPERATIONAL_RELEASE_PENDING") return error(requestId, result.state, "当前路网存在待发布运营快照候选，请先完成或作废该流程。", 409);
  if (result.state === "PLAN_INVALID") return error(requestId, result.state, "正式化计划、拓扑、正式快照或摘要复核失败。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "管理证据、工作流版本或明确确认不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "正式 GIS 原子发布暂不可用。", 503, true);
}
