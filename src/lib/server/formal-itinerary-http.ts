import { readBoundedJson } from "./bounded-json";
import { parseFormalScenicItineraryInput } from "./formal-itinerary-domain";
import type { FormalRoutingRepository } from "./formal-routing-repository";
import { createFormalScenicItinerary } from "./formal-routing-service";

const ITINERARY_JSON_LIMIT_BYTES = 8_192;

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

export async function handleFormalScenicItineraryRequest(
  request: Request,
  repository: FormalRoutingRepository,
  now = new Date(),
) {
  const requestId = crypto.randomUUID();
  if (!sameOrigin(request)) return error(requestId, "REQUEST_REJECTED", "请求无法处理。", 403);
  const body = await readBoundedJson(request, ITINERARY_JSON_LIMIT_BYTES);
  if (!body.ok) {
    if (body.code === "INVALID_CONTENT_TYPE") return error(requestId, body.code, "请使用 JSON 请求。", 415);
    if (body.code === "PAYLOAD_TOO_LARGE") return error(requestId, body.code, "个性路线请求内容过大。", 413);
    return error(requestId, "INVALID_JSON", "JSON 格式不正确。", 400);
  }
  const input = parseFormalScenicItineraryInput(body.value);
  if (!input) return error(requestId, "INVALID_ITINERARY_REQUEST", "请确认时间、兴趣、同行人与正式节点；不接受自定义权重或坐标。", 400);
  const result = await createFormalScenicItinerary(repository, input, now);
  if (result.state === "AVAILABLE") return json({ schemaVersion: 1, requestId, itinerary: result.itinerary }, 200, requestId);
  if (result.state === "ROUTE_VERSION_CHANGED") return error(requestId, "ROUTE_VERSION_CHANGED", "路网或运营版本已变化，请刷新后重试。", 409, true);
  if (result.state === "ITINERARY_UNAVAILABLE") return error(requestId, "ITINERARY_UNAVAILABLE", "当前时间与偏好下没有可安全完成的正式游览路线。", 422);
  return error(requestId, "FORMAL_NETWORK_UNAVAILABLE", "正式路网、游览标签或运营状态尚未发布或已过期。", 503, true);
}
