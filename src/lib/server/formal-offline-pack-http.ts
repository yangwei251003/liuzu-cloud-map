import { isFormalRoutingId } from "./formal-routing-domain";
import { readFormalOfflinePack } from "./formal-offline-pack-service";
import type { FormalOfflinePackRepository } from "./formal-offline-pack-repository";

export type FormalOfflinePackHttpDependencies = {
  repository: FormalOfflinePackRepository;
  isAvailable(): boolean;
};

function response(body: unknown, status: number, requestId: string) {
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

function unavailable(requestId: string) {
  return response({
    requestId,
    error: {
      code: "FORMAL_OFFLINE_PACK_UNAVAILABLE",
      message: "正式离线导航包尚未发布、已过期或未通过完整核验。",
      retryable: true,
    },
  }, 503, requestId);
}

/** Route-handler implementation for GET /api/v1/scenic-areas/:id/offline-pack. */
export async function handleFormalOfflinePackRequest(
  _request: Request,
  dependencies: FormalOfflinePackHttpDependencies,
  scenicAreaId: string,
  now = new Date(),
) {
  const requestId = crypto.randomUUID();
  if (!isFormalRoutingId(scenicAreaId)) {
    return response({
      requestId,
      error: { code: "INVALID_SCENIC_AREA", message: "景区标识格式不正确。", retryable: false },
    }, 400, requestId);
  }
  if (!dependencies.isAvailable()) return unavailable(requestId);
  const result = await readFormalOfflinePack(dependencies.repository, scenicAreaId, now);
  if (result.state !== "AVAILABLE") return unavailable(requestId);
  return response({ requestId, ...result.envelope }, 200, requestId);
}
