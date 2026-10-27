import { readBoundedJson } from "./bounded-json";
import {
  parseFormalGuideAnswerRequest,
  type FormalGuideKnowledgeRepository,
} from "./formal-guide-domain";
import { createRequestId, recordOperationalEvent, recordOperationalMetric } from "./observability";
import { resolveFormalGuideAnswer } from "./formal-guide-service";

const FORMAL_GUIDE_JSON_LIMIT_BYTES = 4_096;

type FormalGuideHttpErrorCode =
  | "REQUEST_REJECTED"
  | "INVALID_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_GUIDE_REQUEST"
  | "PROMPT_INJECTION_REJECTED"
  | "DYNAMIC_OPERATIONAL_QUESTION"
  | "NO_SUPPORTED_KNOWLEDGE"
  | "FORMAL_GUIDE_UNAVAILABLE";

function responseHeaders(requestId: string) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  };
}

function recordResult(requestId: string, code: string, status: number, startedAt: number, claimCount = 0) {
  const durationMs = Math.max(0, Date.now() - startedAt);
  try {
    recordOperationalEvent({
      name: "formal_guide_answer",
      requestId,
      severity: status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO",
      code,
      durationMs,
      // Deliberately omit URL, IP, request body, question, content and source text.
      attributes: { status, claimCount },
    });
    recordOperationalMetric("formal_guide_answer_requests_total", 1, { status, code });
  } catch {
    // Telemetry failure must never broaden a visitor-facing answer or fail open.
  }
}

function formalGuideJson(
  body: unknown,
  status: number,
  requestId: string,
  code: string,
  startedAt: number,
  claimCount = 0,
) {
  recordResult(requestId, code, status, startedAt, claimCount);
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function error(
  requestId: string,
  code: FormalGuideHttpErrorCode,
  message: string,
  retryable: boolean,
  status: number,
  startedAt: number,
) {
  return formalGuideJson({ requestId, error: { code, message, retryable } }, status, requestId, code, startedAt);
}

function sameOriginWriteError(request: Request, requestId: string, startedAt: number) {
  const origin = request.headers.get("origin");
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403, startedAt);
  }
  if (!origin || origin === "null") return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403, startedAt);
  try {
    if (new URL(origin).origin === requestOrigin) return null;
  } catch {
    // Use the same opaque rejection response for malformed Origin values.
  }
  return error(requestId, "REQUEST_REJECTED", "请求无法处理。", false, 403, startedAt);
}

/** POST /api/v1/guide/answers — deterministic answers from current reviewed knowledge only. */
export async function handleFormalGuideAnswerRequest(
  request: Request,
  repository: FormalGuideKnowledgeRepository,
  now = new Date(),
) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const crossOrigin = sameOriginWriteError(request, requestId, startedAt);
  if (crossOrigin) return crossOrigin;

  const body = await readBoundedJson(request, FORMAL_GUIDE_JSON_LIMIT_BYTES);
  if (!body.ok) {
    if (body.code === "INVALID_CONTENT_TYPE") return error(requestId, body.code, "请使用 JSON 请求。", false, 415, startedAt);
    if (body.code === "PAYLOAD_TOO_LARGE") return error(requestId, body.code, "导览问题请求内容过大。", false, 413, startedAt);
    return error(requestId, "INVALID_JSON", "JSON 格式不正确。", false, 400, startedAt);
  }
  const input = parseFormalGuideAnswerRequest(body.value);
  if (!input) {
    return error(
      requestId,
      "INVALID_GUIDE_REQUEST",
      "导览问题只能提交当前景区、快照版本和有限长度的问题文本。",
      false,
      400,
      startedAt,
    );
  }

  const result = await resolveFormalGuideAnswer(repository, input, now);
  if (result.state === "AVAILABLE") {
    return formalGuideJson(
      { schemaVersion: 1, requestId, guide: result.answer },
      200,
      requestId,
      "AVAILABLE",
      startedAt,
      result.answer.claims.length,
    );
  }
  if (result.state === "PROMPT_INJECTION_REJECTED") {
    return error(requestId, result.state, "该问题包含不能由导览接口执行的指令。", false, 422, startedAt);
  }
  if (result.state === "DYNAMIC_OPERATIONAL_QUESTION") {
    return error(
      requestId,
      result.state,
      "实时开放、封路、路线和安全信息必须由已核验的运营渠道提供，当前不会猜测。",
      false,
      422,
      startedAt,
    );
  }
  if (result.state === "NO_SUPPORTED_KNOWLEDGE") {
    return error(requestId, result.state, "当前已审核知识不足以支持这个问题，我不会补写事实。", false, 422, startedAt);
  }
  return error(
    requestId,
    "FORMAL_GUIDE_UNAVAILABLE",
    "已审核且仍有效的发布知识不可用，当前不会生成导览回答。",
    true,
    503,
    startedAt,
  );
}
