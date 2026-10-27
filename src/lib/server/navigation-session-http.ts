import { readBoundedJson } from "./bounded-json";
import {
  applyNavigationSessionEvent,
  createNavigationSession,
  listNavigationSessionHistory,
  type NavigationPlanResolver,
  type NavigationSessionIdentity,
  type NavigationSessionRepository,
} from "./navigation-session-service";

const CREATE_BODY_LIMIT = 4_096;
const EVENT_BODY_LIMIT = 5_120;

export type NavigationSessionAuthentication =
  | { state: "AUTHENTICATED"; identity: NavigationSessionIdentity }
  | { state: "AUTH_REQUIRED" }
  | { state: "AUTH_UNAVAILABLE" };

export type NavigationSessionHttpDependencies = {
  repository: NavigationSessionRepository;
  resolvePlan: NavigationPlanResolver;
  isAvailable: () => boolean;
  authenticate: (request: Request) => Promise<NavigationSessionAuthentication>;
  now?: () => Date;
};

type ErrorCode =
  | "REQUEST_REJECTED" | "NAVIGATION_HISTORY_UNAVAILABLE" | "AUTH_REQUIRED" | "AUTH_UNAVAILABLE"
  | "INVALID_CONTENT_TYPE" | "PAYLOAD_TOO_LARGE" | "INVALID_JSON" | "IDEMPOTENCY_REQUIRED"
  | "INVALID_NAVIGATION_REQUEST" | "FORMAL_ROUTE_UNAVAILABLE" | "SESSION_NOT_FOUND"
  | "REVISION_CONFLICT" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "STORAGE_UNAVAILABLE";

function response(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  } });
}

function error(requestId: string, code: ErrorCode, message: string, status: number, retryable = false, extra: Record<string, unknown> = {}) {
  return response({ requestId, error: { code, message, retryable, ...extra } }, status, requestId);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function authenticate(request: Request, dependencies: NavigationSessionHttpDependencies, requestId: string) {
  let result: NavigationSessionAuthentication;
  try { result = await dependencies.authenticate(request); }
  catch { return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", 503, true) }; }
  if (result.state === "AUTH_REQUIRED") return { error: error(requestId, "AUTH_REQUIRED", "保存或读取导航历史需要登录游客账号。", 401) };
  if (result.state === "AUTH_UNAVAILABLE") return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", 503, true) };
  return { identity: result.identity };
}

async function readBody(request: Request, maximumBytes: number, requestId: string) {
  try {
    const result = await readBoundedJson(request, maximumBytes);
    if (result.ok) return { value: result.value };
    if (result.code === "INVALID_CONTENT_TYPE") return { error: error(requestId, result.code, "请使用 JSON 请求。", 415) };
    if (result.code === "PAYLOAD_TOO_LARGE") return { error: error(requestId, result.code, "导航会话请求内容过大。", 413) };
    return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) };
  } catch { return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400) }; }
}

function available(dependencies: NavigationSessionHttpDependencies) {
  try { return dependencies.isAvailable(); }
  catch { return false; }
}

function unavailable(requestId: string) {
  return error(requestId, "NAVIGATION_HISTORY_UNAVAILABLE", "导航历史尚未绑定真实数据库、游客身份和显式功能开关；前台导航仍可在本机运行。", 503, true);
}

export async function handleCreateNavigationSession(request: Request, dependencies: NavigationSessionHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  if (!available(dependencies)) return unavailable(requestId);
  const auth = await authenticate(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await readBody(request, CREATE_BODY_LIMIT, requestId);
  if ("error" in body) return body.error;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return error(requestId, "IDEMPOTENCY_REQUIRED", "请求需要有效幂等键。", 400);
  const result = await createNavigationSession(dependencies.repository, dependencies.resolvePlan, body.value, auth.identity, idempotencyKey, dependencies.now?.() ?? new Date());
  if (result.state === "CREATED" || result.state === "REPLAYED") return response({ schemaVersion: 1, requestId, state: result.state, session: result.session }, result.state === "CREATED" ? 201 : 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, "INVALID_NAVIGATION_REQUEST", "导航会话只接受当前正式路线的封闭约束，不能提交坐标、几何或任意权重。", 400);
  if (result.state === "FORMAL_ROUTE_UNAVAILABLE") return error(requestId, "FORMAL_ROUTE_UNAVAILABLE", "路线已过期、版本变化或无法由当前正式路网重现，未保存导航会话。", 503, true);
  if (result.state === "ACCOUNT_NOT_FOUND") return error(requestId, "AUTH_REQUIRED", "登录状态已失效，请重新登录。", 401);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, "IDEMPOTENCY_CONFLICT", "请求无法处理。", 409);
  return error(requestId, "STORAGE_UNAVAILABLE", "导航历史暂时无法保存。", 503, true);
}

export async function handleNavigationSessionEvent(request: Request, dependencies: NavigationSessionHttpDependencies, sessionId: string) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  if (!available(dependencies)) return unavailable(requestId);
  const auth = await authenticate(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await readBody(request, EVENT_BODY_LIMIT, requestId);
  if ("error" in body) return body.error;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return error(requestId, "IDEMPOTENCY_REQUIRED", "请求需要有效幂等键。", 400);
  const result = await applyNavigationSessionEvent(dependencies.repository, dependencies.resolvePlan, sessionId, body.value, auth.identity, idempotencyKey, dependencies.now?.() ?? new Date());
  if (result.state === "APPLIED" || result.state === "REPLAYED") return response({ schemaVersion: 1, requestId, state: result.state, action: result.action, session: result.session }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, "INVALID_NAVIGATION_REQUEST", "导航事件只能包含粗粒度生命周期和剩余距离，不能提交坐标、航向或轨迹。", 400);
  if (result.state === "NOT_FOUND") return error(requestId, "SESSION_NOT_FOUND", "未找到可操作的导航会话。", 404);
  if (result.state === "REVISION_CONFLICT") return error(requestId, "REVISION_CONFLICT", "导航会话已更新，请刷新后重试。", 409, true, { currentRevision: result.currentRevision });
  if (result.state === "INVALID_TRANSITION") return error(requestId, "INVALID_TRANSITION", "当前导航状态不允许该操作或剩余距离超出路线范围。", 409);
  if (result.state === "FORMAL_ROUTE_UNAVAILABLE") return error(requestId, "FORMAL_ROUTE_UNAVAILABLE", "当前正式路线或运营状态不可用，已拒绝继续服务器端会话。", 503, true);
  if (result.state === "IDEMPOTENCY_CONFLICT") return error(requestId, "IDEMPOTENCY_CONFLICT", "请求无法处理。", 409);
  return error(requestId, "STORAGE_UNAVAILABLE", "导航历史暂时无法更新。", 503, true);
}

export async function handleNavigationSessionHistory(request: Request, dependencies: NavigationSessionHttpDependencies) {
  const requestId = crypto.randomUUID();
  if (!available(dependencies)) return unavailable(requestId);
  const auth = await authenticate(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit") ?? "20";
  const limit = Number(rawLimit);
  const cursor = url.searchParams.get("cursor");
  const result = await listNavigationSessionHistory(dependencies.repository, auth.identity, limit, cursor);
  if (result.state === "AVAILABLE") return response({ schemaVersion: 1, requestId, ...result.page }, 200, requestId);
  if (result.state === "INVALID_INPUT") return error(requestId, "INVALID_NAVIGATION_REQUEST", "导航历史分页参数不正确。", 400);
  if (result.state === "ACCOUNT_NOT_FOUND") return error(requestId, "AUTH_REQUIRED", "登录状态已失效，请重新登录。", 401);
  return error(requestId, "STORAGE_UNAVAILABLE", "导航历史暂时无法读取。", 503, true);
}
