import { createHash } from "node:crypto";
import { answerGuideQuestion } from "@/lib/ai-guide/service.server";
import { parseAIGuideRequest, type AIGuideError } from "@/lib/ai-guide/types";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { sameOriginWriteError } from "@/lib/server/visitor-identity-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateWindowMs = 60_000;
const rateLimit = 12;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function responseHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorResponse(
  requestId: string,
  code: AIGuideError["error"]["code"],
  message: string,
  retryable: boolean,
  status: number,
) {
  const body: AIGuideError = {
    requestId,
    error: { code, message, retryable },
  };
  return Response.json(body, { status, headers: responseHeaders() });
}

function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = forwarded || request.headers.get("user-agent") || "anonymous";
  return createHash("sha256").update(fingerprint).digest("hex");
}

function isRateLimited(request: Request) {
  const now = Date.now();
  const key = requestKey(request);
  const current = requestBuckets.get(key);

  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + rateWindowMs });
    return false;
  }

  current.count += 1;
  if (requestBuckets.size > 500) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
  }
  return current.count > rateLimit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const originError = sameOriginWriteError(request);
  if (originError) return originError;

  const payloadResult = await readBoundedJson(request, 4_096);
  if (!payloadResult.ok && payloadResult.code === "INVALID_CONTENT_TYPE") {
    return errorResponse(
      requestId,
      "INVALID_REQUEST",
      "请使用 JSON 提交问题。",
      false,
      415,
    );
  }

  if (!payloadResult.ok && payloadResult.code === "PAYLOAD_TOO_LARGE") {
    return errorResponse(requestId, "INVALID_REQUEST", "问题请求内容过大。", false, 413);
  }

  if (!payloadResult.ok) return errorResponse(requestId, "INVALID_REQUEST", "JSON 格式不正确。", false, 400);

  if (isRateLimited(request)) {
    return errorResponse(
      requestId,
      "RATE_LIMITED",
      "提问有些频繁，请稍后再试。",
      true,
      429,
    );
  }

  try {
    const payload = payloadResult.value;
    if (!isRecord(payload)) {
      return errorResponse(requestId, "INVALID_REQUEST", "请求格式不正确。", false, 400);
    }

    const parsed = parseAIGuideRequest(payload);
    if (!parsed) return errorResponse(requestId, "INVALID_REQUEST", "问题、景点或远程处理选择格式不正确。", false, 400);
    const result = await answerGuideQuestion(parsed.question, parsed.spotId, { allowRemote: parsed.allowRemote, requestId });
    return Response.json(result, { headers: responseHeaders() });
  } catch {
    return errorResponse(
      requestId,
      "SERVER_ERROR",
      "导游暂时无法回答，请稍后重试。",
      true,
      500,
    );
  }
}
