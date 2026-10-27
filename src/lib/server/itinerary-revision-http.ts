import { readBoundedJson } from "./bounded-json";
import {
  createSavedItinerary,
  deleteSavedItinerary,
  editSavedItinerary,
  hashItineraryIdempotencyKey,
  listSavedItineraries,
  readSavedItinerary,
  type ItineraryIdentity,
  type ItineraryRepository,
} from "./itinerary-revision-service";

const ITINERARY_JSON_LIMIT_BYTES = 8_192;

type ItineraryHttpErrorCode =
  | "REQUEST_REJECTED"
  | "ITINERARY_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "INVALID_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_ITINERARY"
  | "PUBLISHED_CATALOG_UNAVAILABLE"
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "ITINERARY_NOT_FOUND";

export type ItineraryAuthentication =
  | { state: "AUTHENTICATED"; identity: ItineraryIdentity }
  | { state: "AUTH_REQUIRED" }
  | { state: "AUTH_UNAVAILABLE" };

export type ItineraryHttpDependencies = {
  repository: ItineraryRepository;
  /** Returns false unless persistent visitor identity and database storage are enabled. */
  isAvailable: () => boolean;
  authenticate: (request: Request) => Promise<ItineraryAuthentication>;
  now?: () => Date;
};

function createRequestId() {
  return crypto.randomUUID();
}

function itineraryJson(body: unknown, status: number, requestId: string) {
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
  code: ItineraryHttpErrorCode,
  message: string,
  retryable: boolean,
  status: number,
  extra: Record<string, unknown> = {},
) {
  return itineraryJson({ requestId, error: { code, message, retryable, ...extra } }, status, requestId);
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
    // Preserve the same opaque rejection for a malformed Origin header.
  }
  return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403);
}

function unavailable(requestId: string) {
  return error(
    requestId,
    "ITINERARY_UNAVAILABLE",
    "行程跨设备保存尚未完成受控运行配置，当前不会写入服务器端行程。",
    true,
    503,
  );
}

function isAvailable(dependencies: ItineraryHttpDependencies) {
  try {
    return dependencies.isAvailable();
  } catch {
    return false;
  }
}

async function authenticated(
  request: Request,
  dependencies: ItineraryHttpDependencies,
  requestId: string,
) {
  let authentication: ItineraryAuthentication;
  try {
    authentication = await dependencies.authenticate(request);
  } catch {
    return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", true, 503) };
  }
  if (authentication.state === "AUTHENTICATED") return { identity: authentication.identity };
  if (authentication.state === "AUTH_UNAVAILABLE") {
    return { error: error(requestId, "AUTH_UNAVAILABLE", "账号服务暂时不可用。", true, 503) };
  }
  return { error: error(requestId, "AUTH_REQUIRED", "保存或查看跨设备行程需要登录游客账号。", false, 401) };
}

async function bodyOrError(request: Request, requestId: string) {
  try {
    const body = await readBoundedJson(request, ITINERARY_JSON_LIMIT_BYTES);
    if (body.ok) return { value: body.value };
    if (body.code === "INVALID_CONTENT_TYPE") return { error: error(requestId, body.code, "请使用 JSON 请求。", false, 415) };
    if (body.code === "PAYLOAD_TOO_LARGE") return { error: error(requestId, body.code, "行程请求内容过大。", false, 413) };
    return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400) };
  } catch {
    return { error: error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400) };
  }
}

function idempotencyOrError(request: Request, requestId: string) {
  const idempotencyKeyHash = hashItineraryIdempotencyKey(request.headers.get("idempotency-key"));
  return idempotencyKeyHash
    ? { idempotencyKeyHash }
    : { error: error(requestId, "IDEMPOTENCY_REQUIRED", "请求需要有效的幂等键。", false, 400) };
}

function mutationError(
  requestId: string,
  state: "INVALID_INPUT" | "ACCOUNT_NOT_FOUND" | "PUBLISHED_CATALOG_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" | "NOT_FOUND",
) {
  if (state === "INVALID_INPUT") {
    return error(requestId, "INVALID_ITINERARY", "行程只接受已发布 POI 标识和有限编辑字段，不接受坐标、轨迹或路线几何。", false, 400);
  }
  if (state === "ACCOUNT_NOT_FOUND") {
    return error(requestId, "AUTH_REQUIRED", "登录状态已失效，请重新登录后再试。", false, 401);
  }
  if (state === "PUBLISHED_CATALOG_UNAVAILABLE") {
    return error(
      requestId,
      "PUBLISHED_CATALOG_UNAVAILABLE",
      "当前没有完整、有效且已发布的地点目录，不能保存或重排该行程。",
      true,
      503,
    );
  }
  if (state === "IDEMPOTENCY_CONFLICT") return error(requestId, "IDEMPOTENCY_CONFLICT", "请求无法处理。", false, 409);
  if (state === "NOT_FOUND") return error(requestId, "ITINERARY_NOT_FOUND", "未找到可操作的行程。", false, 404);
  return unavailable(requestId);
}

function revisionConflict(requestId: string, currentRevision: number | null) {
  return error(requestId, "REVISION_CONFLICT", "行程已更新，请刷新后再试。", true, 409, { currentRevision });
}

/** GET /api/v1/itineraries — owner-scoped, no location or route geometry. */
export async function handleListItinerariesRequest(request: Request, dependencies: ItineraryHttpDependencies) {
  const requestId = createRequestId();
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const result = await listSavedItineraries(dependencies.repository, auth.identity);
  if (result.state !== "AVAILABLE") return unavailable(requestId);
  return itineraryJson({ schemaVersion: 1, requestId, itineraries: result.itineraries }, 200, requestId);
}

/** POST /api/v1/itineraries — creates revision 1 from a published catalog only. */
export async function handleCreateItineraryRequest(request: Request, dependencies: ItineraryHttpDependencies) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await bodyOrError(request, requestId);
  if ("error" in body) return body.error;
  const idempotency = idempotencyOrError(request, requestId);
  if ("error" in idempotency) return idempotency.error;
  const result = await createSavedItinerary(
    dependencies.repository,
    body.value,
    auth.identity,
    idempotency.idempotencyKeyHash,
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "CREATED" || result.state === "REPLAYED") {
    return itineraryJson({ schemaVersion: 1, requestId, state: result.state, itinerary: result.itinerary }, result.state === "CREATED" ? 201 : 200, requestId);
  }
  return mutationError(requestId, result.state);
}

/** GET /api/v1/itineraries/:id — non-owners receive the same not-found response. */
export async function handleReadItineraryRequest(
  request: Request,
  dependencies: ItineraryHttpDependencies,
  itineraryId: string,
) {
  const requestId = createRequestId();
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const result = await readSavedItinerary(dependencies.repository, auth.identity, itineraryId);
  if (result.state !== "AVAILABLE") {
    return result.state === "NOT_FOUND" ? mutationError(requestId, "NOT_FOUND") : unavailable(requestId);
  }
  return itineraryJson({ schemaVersion: 1, requestId, itinerary: result.itinerary }, 200, requestId);
}

/** PATCH /api/v1/itineraries/:id — appends an immutable revision and invalidates old execution. */
export async function handleEditItineraryRequest(
  request: Request,
  dependencies: ItineraryHttpDependencies,
  itineraryId: string,
) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await bodyOrError(request, requestId);
  if ("error" in body) return body.error;
  const idempotency = idempotencyOrError(request, requestId);
  if ("error" in idempotency) return idempotency.error;
  const result = await editSavedItinerary(
    dependencies.repository,
    itineraryId,
    body.value,
    auth.identity,
    idempotency.idempotencyKeyHash,
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "UPDATED" || result.state === "REPLAYED") {
    return itineraryJson({ schemaVersion: 1, requestId, state: result.state, itinerary: result.itinerary }, 200, requestId);
  }
  if (result.state === "REVISION_CONFLICT") return revisionConflict(requestId, result.currentRevision);
  return mutationError(requestId, result.state);
}

/** DELETE /api/v1/itineraries/:id — soft deletion retains an audit-safe revision only. */
export async function handleDeleteItineraryRequest(
  request: Request,
  dependencies: ItineraryHttpDependencies,
  itineraryId: string,
) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;
  if (!isAvailable(dependencies)) return unavailable(requestId);
  const auth = await authenticated(request, dependencies, requestId);
  if ("error" in auth) return auth.error;
  const body = await bodyOrError(request, requestId);
  if ("error" in body) return body.error;
  const idempotency = idempotencyOrError(request, requestId);
  if ("error" in idempotency) return idempotency.error;
  const result = await deleteSavedItinerary(
    dependencies.repository,
    itineraryId,
    body.value,
    auth.identity,
    idempotency.idempotencyKeyHash,
    dependencies.now?.() ?? new Date(),
  );
  if (result.state === "DELETED" || result.state === "REPLAYED") {
    return itineraryJson({ schemaVersion: 1, requestId, state: result.state, itinerary: result.itinerary }, 200, requestId);
  }
  if (result.state === "REVISION_CONFLICT") return revisionConflict(requestId, result.currentRevision);
  return mutationError(requestId, result.state);
}
