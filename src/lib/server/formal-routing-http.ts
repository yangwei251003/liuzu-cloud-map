import { readBoundedJson } from "./bounded-json";
import { isFormalRoutingId, parseFormalRoutePlanInput } from "./formal-routing-domain";
import {
  createFormalRoutePlan,
  readFormalRoutingSnapshot,
} from "./formal-routing-service";
import type { FormalRoutingRepository } from "./formal-routing-repository";

const ROUTE_PLAN_JSON_LIMIT_BYTES = 4_096;

type FormalRoutingErrorCode =
  | "REQUEST_REJECTED"
  | "INVALID_SCENIC_AREA"
  | "INVALID_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_ROUTE_REQUEST"
  | "FORMAL_NETWORK_UNAVAILABLE"
  | "ROUTE_VERSION_CHANGED"
  | "ROUTE_UNAVAILABLE";

function requestId() {
  return crypto.randomUUID();
}

function formalRoutingJson(body: unknown, status: number, id: string) {
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
      "X-Request-Id": id,
    },
  });
}

function formalRoutingError(
  id: string,
  code: FormalRoutingErrorCode,
  message: string,
  retryable: boolean,
  status: number,
) {
  return formalRoutingJson({ requestId: id, error: { code, message, retryable } }, status, id);
}

function sameOriginWriteError(request: Request, id: string) {
  const origin = request.headers.get("origin");
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return formalRoutingError(id, "REQUEST_REJECTED", "请求无法处理。", false, 403);
  }
  if (!origin || origin === "null") return formalRoutingError(id, "REQUEST_REJECTED", "请求无法处理。", false, 403);
  try {
    if (new URL(origin).origin === requestOrigin) return null;
  } catch {
    // Use the same opaque response for malformed Origin values.
  }
  return formalRoutingError(id, "REQUEST_REJECTED", "请求无法处理。", false, 403);
}

function formalNetworkUnavailable(id: string) {
  return formalRoutingError(
    id,
    "FORMAL_NETWORK_UNAVAILABLE",
    "正式路网与运营状态尚未完成发布或已过期，当前不能提供内部导航。",
    true,
    503,
  );
}

/** Route-handler implementation for GET /api/v1/scenic-areas/:id/snapshot. */
export async function handleFormalScenicSnapshotRequest(
  request: Request,
  repository: FormalRoutingRepository,
  scenicAreaId: string,
  now = new Date(),
) {
  const id = requestId();
  if (!isFormalRoutingId(scenicAreaId)) {
    return formalRoutingError(id, "INVALID_SCENIC_AREA", "景区标识格式不正确。", false, 400);
  }
  const result = await readFormalRoutingSnapshot(repository, scenicAreaId, now);
  if (result.state !== "AVAILABLE") return formalNetworkUnavailable(id);
  return formalRoutingJson({ schemaVersion: 1, requestId: id, snapshot: result.snapshot }, 200, id);
}

/** Route-handler implementation for POST /api/v1/route-plans. */
export async function handleFormalRoutePlanRequest(
  request: Request,
  repository: FormalRoutingRepository,
  now = new Date(),
) {
  const id = requestId();
  const crossOrigin = sameOriginWriteError(request, id);
  if (crossOrigin) return crossOrigin;

  const body = await readBoundedJson(request, ROUTE_PLAN_JSON_LIMIT_BYTES);
  if (!body.ok) {
    if (body.code === "INVALID_CONTENT_TYPE") {
      return formalRoutingError(id, body.code, "请使用 JSON 请求。", false, 415);
    }
    if (body.code === "PAYLOAD_TOO_LARGE") {
      return formalRoutingError(id, body.code, "路线请求内容过大。", false, 413);
    }
    return formalRoutingError(id, "INVALID_JSON", "JSON 格式不正确。", false, 400);
  }
  const input = parseFormalRoutePlanInput(body.value);
  if (!input) {
    return formalRoutingError(id, "INVALID_ROUTE_REQUEST", "路线请求必须使用当前快照中的精确节点和版本。", false, 400);
  }
  const result = await createFormalRoutePlan(repository, input, now);
  if (result.state === "AVAILABLE") {
    return formalRoutingJson({ schemaVersion: 1, requestId: id, routePlan: result.plan }, 200, id);
  }
  if (result.state === "FORMAL_NETWORK_UNAVAILABLE") return formalNetworkUnavailable(id);
  if (result.state === "ROUTE_VERSION_CHANGED") {
    return formalRoutingError(id, "ROUTE_VERSION_CHANGED", "路网或运营状态已变化，请先刷新快照再重新规划。", true, 409);
  }
  return formalRoutingError(id, "ROUTE_UNAVAILABLE", "当前没有可安全使用的正式路线。", false, 422);
}
