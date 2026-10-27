import { createHash } from "node:crypto";
import { extractItinerary } from "@/lib/itinerary-extract/service.server";
import type { ItineraryExtractionError } from "@/lib/itinerary-extract/types";
import { readBoundedJson } from "@/lib/server/bounded-json";

export const runtime = "nodejs";

const buckets = new Map<string, { count: number; resetAt: number }>();

function headers() {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
}

function error(requestId: string, code: ItineraryExtractionError["error"]["code"], message: string, retryable: boolean, status: number) {
  const body: ItineraryExtractionError = { requestId, error: { code, message, retryable } };
  return Response.json(body, { status, headers: headers() });
}

function limited(request: Request) {
  const now = Date.now();
  const fingerprint = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("user-agent") || "anonymous";
  const key = createHash("sha256").update(fingerprint).digest("hex");
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const payloadResult = await readBoundedJson(request, 32_768);
  if (!payloadResult.ok && payloadResult.code === "INVALID_CONTENT_TYPE") {
    return error(requestId, "INVALID_REQUEST", "请使用 JSON 提交游记文本。", false, 415);
  }
  if (!payloadResult.ok && payloadResult.code === "PAYLOAD_TOO_LARGE") return error(requestId, "INVALID_REQUEST", "游记请求内容过大。", false, 413);
  if (!payloadResult.ok) return error(requestId, "INVALID_REQUEST", "JSON 格式不正确。", false, 400);
  if (limited(request)) return error(requestId, "RATE_LIMITED", "提取操作有些频繁，请稍后再试。", true, 429);

  try {
    const payload = payloadResult.value;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "text" && key !== "allowRemote")) {
      return error(requestId, "INVALID_REQUEST", "游记请求包含未允许字段。", false, 400);
    }
    const text = typeof payload === "object" && payload !== null && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).text === "string"
      ? ((payload as Record<string, unknown>).text as string).trim()
      : "";
    const allowRemote = typeof payload === "object" && payload !== null && !Array.isArray(payload) && (payload as Record<string, unknown>).allowRemote === true;
    if (text.length < 4 || text.length > 6_000) {
      return error(requestId, "INVALID_REQUEST", "游记文本长度需在 4 到 6000 个字符之间。", false, 400);
    }
    return Response.json(await extractItinerary(text, requestId, allowRemote), { headers: headers() });
  } catch {
    return error(requestId, "SERVER_ERROR", "暂时无法提取行程，请稍后重试。", true, 500);
  }
}
