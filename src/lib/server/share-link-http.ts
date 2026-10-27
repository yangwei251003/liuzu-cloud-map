import { evaluateServerShareCapability } from "./share-link-capability";
import { readBoundedJson } from "./bounded-json";

const MAX_JSON_BYTES = 16_384;

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function serverShareUnavailable() {
  const capability = evaluateServerShareCapability();
  if (capability.state === "DISABLED") {
    return privateJson(
      { error: { code: "CAPABILITY_DISABLED", message: "跨设备分享后端尚未启用，现有本机演示分享不受影响。", retryable: false } },
      503,
    );
  }
  return null;
}

export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BYTES) {
  const result = await readBoundedJson(request, maxBytes);
  if (result.ok) return result;
  if (result.code === "INVALID_CONTENT_TYPE") return { ok: false as const, response: privateJson({ error: { code: result.code, message: "请使用 JSON 请求。", retryable: false } }, 415) };
  if (result.code === "PAYLOAD_TOO_LARGE") return { ok: false as const, response: privateJson({ error: { code: result.code, message: "请求内容过大。", retryable: false } }, 413) };
  return { ok: false as const, response: privateJson({ error: { code: result.code, message: "JSON 格式不正确。", retryable: false } }, 400) };
}
