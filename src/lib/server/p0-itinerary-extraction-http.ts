import { parseStructuredItineraryExtractionRequest } from "../p0-itinerary-extraction/domain";
import { resolveStructuredItineraryExtraction } from "../p0-itinerary-extraction/service";
import type { PublishedPoiCatalogRepository } from "../p0-itinerary-extraction/types";
import { readBoundedJson } from "./bounded-json";

const ITINERARY_EXTRACTION_JSON_LIMIT_BYTES = 12_288;

type ItineraryExtractionErrorCode =
  | "REQUEST_REJECTED"
  | "INVALID_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_ITINERARY_EXTRACTION"
  | "PUBLISHED_CATALOG_UNAVAILABLE"
  | "CATALOG_REVISION_CHANGED";

function createRequestId() {
  return crypto.randomUUID();
}

function privateJson(body: unknown, status: number, requestId: string) {
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
  code: ItineraryExtractionErrorCode,
  message: string,
  retryable: boolean,
  status: number,
) {
  return privateJson({ requestId, error: { code, message, retryable } }, status, requestId);
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
    // Reject a malformed Origin with the same opaque response.
  }
  return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403);
}

/** Route-handler implementation for POST /api/v1/itinerary-extractions. */
export async function handleStructuredItineraryExtractionRequest(
  request: Request,
  repository: PublishedPoiCatalogRepository,
  now = new Date(),
) {
  const requestId = createRequestId();
  const crossOrigin = sameOriginWriteError(request, requestId);
  if (crossOrigin) return crossOrigin;

  const body = await readBoundedJson(request, ITINERARY_EXTRACTION_JSON_LIMIT_BYTES);
  if (!body.ok) {
    if (body.code === "INVALID_CONTENT_TYPE") return error(requestId, body.code, "请使用 JSON 请求。", false, 415);
    if (body.code === "PAYLOAD_TOO_LARGE") return error(requestId, body.code, "游记提取请求内容过大。", false, 413);
    return error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400);
  }
  const input = parseStructuredItineraryExtractionRequest(body.value);
  if (!input) {
    return error(
      requestId,
      "INVALID_ITINERARY_EXTRACTION",
      "游记提取只能提交受限的自然语言结构，不接受 POI 标识、坐标或路线字段。",
      false,
      400,
    );
  }

  const result = await resolveStructuredItineraryExtraction(repository, input, now);
  if (result.state === "PUBLISHED_CATALOG_UNAVAILABLE") {
    return error(
      requestId,
      "PUBLISHED_CATALOG_UNAVAILABLE",
      "当前没有完整、有效且已发布的地点目录，不能生成可保存的结构化行程。",
      true,
      503,
    );
  }
  if (result.state === "CATALOG_REVISION_CHANGED") {
    return error(
      requestId,
      "CATALOG_REVISION_CHANGED",
      "地点目录已更新，请刷新后重新提取。",
      true,
      409,
    );
  }
  return privateJson({ schemaVersion: 1, requestId, itinerary: result.itinerary }, 200, requestId);
}
