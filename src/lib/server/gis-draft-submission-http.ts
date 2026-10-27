import { readBoundedJson } from "./bounded-json";
import type { AdminRole } from "./admin-oidc-rbac-domain";
import {
  listPendingGisDraftSubmissions,
  readGisDraftSubmissionForReview,
  reviewGisDraftSubmission,
  submitGisDraftCollection,
  type GisDraftAdminActor,
  type GisDraftSubmissionRepository,
} from "./gis-draft-submission-service";

const GIS_DRAFT_BODY_LIMIT_BYTES = 1_000_000;
const SCENIC_AREA_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type GisDraftWorkflowAuthorization =
  | { state: "AUTHORIZED"; actor: GisDraftAdminActor }
  | { state: "UNAVAILABLE" | "DENIED" };

export type GisDraftWorkflowHttpDependencies = {
  repository: GisDraftSubmissionRepository;
  authorize(request: Request, scenicAreaId: string, roles: readonly AdminRole[]): Promise<GisDraftWorkflowAuthorization>;
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

function parsePositiveInteger(value: string | null, maximum: number) {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function parseListQuery(request: Request) {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const allowed = new Set(["limit", "beforeRevision"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return null;
  if (url.searchParams.getAll("limit").length > 1 || url.searchParams.getAll("beforeRevision").length > 1) return null;
  const rawLimit = url.searchParams.get("limit");
  const rawBefore = url.searchParams.get("beforeRevision");
  const limit = rawLimit === null ? 25 : parsePositiveInteger(rawLimit, 50);
  const beforeRevision = rawBefore === null ? null : parsePositiveInteger(rawBefore, 2_147_483_647);
  return limit === null || (rawBefore !== null && beforeRevision === null) ? null : { limit, beforeRevision };
}

async function readInput(request: Request, requestId: string) {
  const body = await readBoundedJson(request, GIS_DRAFT_BODY_LIMIT_BYTES);
  if (body.ok) return body;
  if (body.code === "INVALID_CONTENT_TYPE") return { response: error(requestId, body.code, "请使用 JSON 请求。", 415) };
  if (body.code === "PAYLOAD_TOO_LARGE") return { response: error(requestId, body.code, "候选 GIS 提交超过 1 MB，请拆分批次。", 413) };
  return { response: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
}

async function authorize(
  request: Request,
  scenicAreaId: string,
  roles: readonly AdminRole[],
  dependencies: GisDraftWorkflowHttpDependencies,
  requestId: string,
) {
  if (!SCENIC_AREA_PATTERN.test(scenicAreaId)) return { response: error(requestId, "INVALID_SCENIC_AREA", "景区标识无效。", 400) };
  const result = await dependencies.authorize(request, scenicAreaId, roles).catch(() => ({ state: "UNAVAILABLE" as const }));
  if (result.state === "AUTHORIZED") return result;
  return result.state === "UNAVAILABLE"
    ? { response: error(requestId, "ADMIN_WORKFLOW_UNAVAILABLE", "GIS 审核服务尚未完成真库、OIDC/MFA 与可信身份断言配置。", 503, true) }
    : { response: error(requestId, "ADMIN_AUTHORIZATION_DENIED", "当前管理员身份不能执行此操作。", 403) };
}

export async function handleCreateGisDraftSubmission(
  request: Request,
  scenicAreaId: string,
  dependencies: GisDraftWorkflowHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["GIS_EDITOR"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await submitGisDraftCollection(
    dependencies.repository,
    body.value,
    auth.actor,
    request.headers.get("idempotency-key"),
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "CREATED" || result.state === "REPLAYED") {
    return json({ schemaVersion: 1, requestId, receipt: result.receipt }, result.state === "CREATED" ? 201 : 200, requestId);
  }
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, result.state, "幂等键已用于另一份候选数据。", 409);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "候选集合、景区或幂等键不符合严格提交契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "GIS 候选审核存储暂不可用，本地草稿未受影响。", 503, true);
}

export async function handleListPendingGisDraftSubmissions(
  request: Request,
  scenicAreaId: string,
  dependencies: GisDraftWorkflowHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOriginReadContext(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const query = parseListQuery(request);
  if (!query) return error(requestId, "INVALID_QUERY", "待审队列分页参数无效。", 400);
  const auth = await authorize(request, scenicAreaId, ["GIS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await listPendingGisDraftSubmissions(dependencies.repository, query, auth.actor);
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, page: result.page }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "待审队列请求不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "GIS 待审队列暂不可用。", 503, true);
}

export async function handleReadGisDraftSubmissionForReview(
  request: Request,
  scenicAreaId: string,
  submissionId: string,
  dependencies: GisDraftWorkflowHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOriginReadContext(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["GIS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const result = await readGisDraftSubmissionForReview(dependencies.repository, submissionId, auth.actor);
  if (result.state === "FOUND") return json({ schemaVersion: 1, requestId, detail: result.detail }, 200, requestId);
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "候选提交不存在。", 404);
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "候选提交标识无效。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "GIS 候选详情暂不可用。", 503, true);
}

export async function handleReviewGisDraftSubmission(
  request: Request,
  scenicAreaId: string,
  submissionId: string,
  dependencies: GisDraftWorkflowHttpDependencies,
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const auth = await authorize(request, scenicAreaId, ["GIS_REVIEWER"], dependencies, requestId);
  if ("response" in auth) return auth.response;
  const body = await readInput(request, requestId);
  if ("response" in body) return body.response;
  const result = await reviewGisDraftSubmission(
    dependencies.repository,
    submissionId,
    body.value,
    auth.actor,
    request.headers.get("idempotency-key"),
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "UPDATED" || result.state === "REPLAYED") {
    return json({ schemaVersion: 1, requestId, receipt: result.receipt }, 200, requestId);
  }
  if (result.state === "NOT_FOUND") return error(requestId, result.state, "候选提交不存在。", 404);
  if (result.state === "SUBMITTER_CANNOT_REVIEW") return error(requestId, result.state, "提交人与审核人必须职责分离。", 403);
  if (result.state === "REVISION_CONFLICT" || result.state === "IDEMPOTENCY_CONFLICT") {
    return error(requestId, result.state, "审核版本或幂等键已变化，请刷新后重试。", 409, true);
  }
  if (result.state === "INVALID_INPUT") return error(requestId, result.state, "审核决定、证据或版本不符合严格契约。", 400);
  return error(requestId, "STORAGE_UNAVAILABLE", "GIS 审核存储暂不可用。", 503, true);
}
