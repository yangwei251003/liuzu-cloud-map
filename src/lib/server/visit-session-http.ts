import { readBoundedJson } from "./bounded-json";
import { hashVisitSessionIdempotencyKey, type VisitSessionIdentity, type VisitSessionRepository } from "./visit-session-service";
import { applyVisitSessionEvent, createVisitSession } from "./visit-session-service";

const CREATE_JSON_LIMIT_BYTES = 2_048;
const EVENT_JSON_LIMIT_BYTES = 1_024;

type VisitSessionHttpErrorCode =
  | "REQUEST_REJECTED"
  | "VISIT_SESSION_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "INVALID_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_SESSION_REQUEST"
  | "FORMAL_ROUTE_UNAVAILABLE"
  | "REVISION_CONFLICT"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_CONFLICT"
  | "SESSION_NOT_FOUND";

export type VisitSessionAuthentication =
  | { state: "AUTHENTICATED"; identity: VisitSessionIdentity }
  | { state: "AUTH_REQUIRED" }
  | { state: "AUTH_UNAVAILABLE" };

export type VisitSessionHttpDependencies = {
  repository: VisitSessionRepository;
  /** Returns false unless database + visitor identity configuration is enabled. */
  isAvailable: () => boolean;
  authenticate: (request: Request) => Promise<VisitSessionAuthentication>;
  now?: () => Date;
};

function createRequestId() {
  return crypto.randomUUID();
}

function visitSessionJson(body: unknown, status: number, requestId: string) {
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

function error(
  requestId: string,
  code: VisitSessionHttpErrorCode,
  message: string,
  retryable: boolean,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return visitSessionJson({ requestId, error: { code, message, retryable, ...extra } }, status, requestId);
}

function sameOriginWriteError(request: Request, requestId: string) {
  const origin = request.headers.get("origin");
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403);
  }
  if (!origin || origin === "null") return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403);
  try {
    if (new URL(origin).origin === requestOrigin) return null;
  } catch {
    // Fall through to the non-enumerating rejection below.
  }
  return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403);
}

function unavailable(requestId: string) {
  return error(
    requestId,
    "VISIT_SESSION_UNAVAILABLE",
    "游览会话服务尚未完成受控运行配置，当前不会保存或继续服务器端导览。",
    true,
    503,
  );
}

async function authenticated(
  request: Request,
  dependencies: VisitSessionHttpDependencies,
  requestId: string,
) {
  let result: VisitSessionAuthentication;
  try {
    result = await dependencies.authenticate(request);
  } catch {
    return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", true, 503) };
  }
  if (result.state !== "AUTHENTICATED") {
    if (result.state === "AUTH_UNAVAILABLE") {
      return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", true, 503) };
    }
    return { error: error(requestId, "AUTH_REQUIRED", "保存游览会话需要登录游客账号。", false, 401) };
  }
  return { identity: result.identity };
}

async function bodyOrError(request: Request, maxBytes: number, requestId: string) {
  try {
    const body = await readBoundedJson(request, maxBytes);
    if (body.ok) return { value: body.value };
    if (body.code === "INVALID_CONTENT_TYPE") {
      return { error: error(requestId, body.code, "请使用 JSON 请求。", false, 415) };
    }
    if (body.code === "PAYLOAD_TOO_LARGE") {
      return { error: error(requestId, body.code, "游览会话请求内容过大。", false, 413) };
    }
    return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400) };
  } catch {
    return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400) };
  }
}

function idempotencyOrError(request: Request, requestId: string) {
  const idempotencyKeyHash = hashVisitSessionIdempotencyKey(request.headers.get("idempotency-key"));
  return idempotencyKeyHash
    ? { idempotencyKeyHash }
    : { error: error(requestId, "IDEMPOTENCY_REQUIRED", "请求需要有效的幂等键。", false, 400) };
}

function isAvailable(dependencies: VisitSessionHttpDependencies) {
  try {
    return dependencies.isAvailable();
  } catch {
    return false;
  }
}

/** POST /api/v1/visit-sessions — creates a READY session, never a route. */
export async function handleCreateVisitSessionRequest(
  request: Request,
  dependencies: VisitSessionHttpDependencies,
) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await bodyOrError(request, CREATE_JSON_LIMIT_BYTES, requestId);
  if ("error" in body) return body.error;
  const idempotency = idempotencyOrError(request, requestId);
  if ("error" in idempotency) return idempotency.error;

  const result = await createVisitSession(
    dependencies.repository,
    body.value,
    auth.identity,
    idempotency.idempotencyKeyHash,
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "CREATED" || result.state === "REPLAYED") {
    return visitSessionJson({ schemaVersion: 1, requestId, state: result.state, session: result.session }, result.state === "CREATED" ? 201 : 200, requestId);
  }
  if (result.state === "INVALID_INPUT") {
    return error(requestId, "INVALID_SESSION_REQUEST", "游览会话只接受已发布行程、正式路线快照和有限字段。", false, 400);
  }
  if (result.state === "NOT_FOUND") {
    return error(requestId, "AUTH_REQUIRED", "登录状态已失效，请重新登录后再试。", false, 401);
  }
  if (result.state === "FORMAL_ROUTE_UNAVAILABLE") {
    return error(requestId, "FORMAL_ROUTE_UNAVAILABLE", "正式路线快照或运营状态不可用，不能开始服务器端导览。", true, 503);
  }
  if (result.state === "IDEMPOTENCY_CONFLICT") {
    return error(requestId, "IDEMPOTENCY_CONFLICT", "请求无法处理。", false, 409);
  }
  return unavailable(requestId);
}

/** POST /api/v1/visit-sessions/:id/events — coarse lifecycle changes only. */
export async function handleVisitSessionEventRequest(
  request: Request,
  dependencies: VisitSessionHttpDependencies,
  sessionId: string,
) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await bodyOrError(request, EVENT_JSON_LIMIT_BYTES, requestId);
  if ("error" in body) return body.error;
  const idempotency = idempotencyOrError(request, requestId);
  if ("error" in idempotency) return idempotency.error;

  const result = await applyVisitSessionEvent(
    dependencies.repository,
    sessionId,
    body.value,
    auth.identity,
    idempotency.idempotencyKeyHash,
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "APPLIED" || result.state === "REPLAYED") {
    return visitSessionJson(
      { schemaVersion: 1, requestId, state: result.state, action: result.action, session: result.session },
      200,
      requestId,
    );
  }
  if (result.state === "INVALID_INPUT") {
    return error(requestId, "INVALID_SESSION_REQUEST", "事件格式不正确，不能提交位置、路线或 AI 内容。", false, 400);
  }
  if (result.state === "NOT_FOUND") {
    return error(requestId, "SESSION_NOT_FOUND", "未找到可操作的游览会话。", false, 404);
  }
  if (result.state === "REVISION_CONFLICT") {
    return error(requestId, "REVISION_CONFLICT", "游览会话已更新，请刷新后再试。", true, 409, {
      currentRevision: result.currentRevision,
    });
  }
  if (result.state === "INVALID_TRANSITION") {
    return error(requestId, "INVALID_TRANSITION", "当前游览状态不允许该操作。", false, 409);
  }
  if (result.state === "FORMAL_ROUTE_UNAVAILABLE") {
    return error(requestId, "FORMAL_ROUTE_UNAVAILABLE", "正式路线快照或运营状态不可用，已拒绝继续导览。", true, 503);
  }
  if (result.state === "IDEMPOTENCY_CONFLICT") {
    return error(requestId, "IDEMPOTENCY_CONFLICT", "请求无法处理。", false, 409);
  }
  return unavailable(requestId);
}
