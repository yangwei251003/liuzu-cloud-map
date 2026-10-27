import { privateJson } from "./share-link-http";
import { hashDataRightsIdempotencyKey, parseDataRightsIdempotencyKey } from "./visitor-data-rights-domain";
import { withClearedSessionCookie } from "./visitor-identity-http";

export function dataRightsIdempotencyFromRequest(request: Request) {
  const key = parseDataRightsIdempotencyKey(request.headers.get("idempotency-key"));
  if (!key) {
    return {
      ok: false as const,
      response: privateJson(
        { error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "请求无法处理。", retryable: false } },
        400,
      ),
    };
  }
  return { ok: true as const, keyHash: hashDataRightsIdempotencyKey(key) };
}

export function dataRightsAuthRequired() {
  return withClearedSessionCookie(
    privateJson(
      { error: { code: "AUTH_REQUIRED", message: "需要游客账号会话。", retryable: false } },
      401,
    ),
  );
}

export function withDeletedAccountClientStateCleared(response: Response) {
  response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  return withClearedSessionCookie(response);
}
