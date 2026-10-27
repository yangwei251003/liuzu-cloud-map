import { readBoundedJson } from "./bounded-json";
import { privateJson } from "./share-link-http";
import { evaluateVisitorAuthCapability } from "./visitor-identity-capability";
import { getVisitorIdentityForSession, type VisitorIdentityRepository } from "./visitor-identity-service";

const AUTH_JSON_LIMIT_BYTES = 4_096;
export const VISITOR_SESSION_COOKIE_NAME = "liuzu_visitor_session";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function originsMatch(originUrl: URL, requestUrl: URL) {
  if (originUrl.origin === requestUrl.origin) return true;
  return (
    originUrl.protocol === requestUrl.protocol &&
    originUrl.port === requestUrl.port &&
    isLoopbackHostname(originUrl.hostname) &&
    isLoopbackHostname(requestUrl.hostname)
  );
}

export function visitorAuthUnavailable() {
  if (evaluateVisitorAuthCapability().state === "ENABLED") return null;
  return privateJson(
    {
      error: {
        code: "CAPABILITY_DISABLED",
        message: "游客跨设备账号服务尚未完成运行配置，请继续使用本机私有体验。",
        retryable: false,
      },
    },
    503,
  );
}

export function sameOriginWriteError(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return privateJson({ error: { code: "REQUEST_REJECTED", message: "请求无法处理。", retryable: false } }, 403);
  }

  // Browsers may omit Origin for a same-origin fetch. In that narrow case,
  // require a parseable, same-origin Referer instead. An explicit null or
  // malformed Origin never falls back to Referer, so cross-origin requests
  // continue to fail closed.
  if (origin !== null) {
    try {
      if (origin !== "null" && originsMatch(new URL(origin), requestUrl)) return null;
    } catch {
      // A malformed Origin is rejected below using the same non-enumerating response.
    }
  } else if (referer) {
    try {
      if (originsMatch(new URL(referer), requestUrl)) return null;
    } catch {
      // A malformed Referer is rejected below using the same non-enumerating response.
    }
  }
  return privateJson({ error: { code: "REQUEST_REJECTED", message: "请求无法处理。", retryable: false } }, 403);
}

export async function readVisitorAuthJson(request: Request) {
  const result = await readBoundedJson(request, AUTH_JSON_LIMIT_BYTES);
  if (result.ok) return result;
  const response =
    result.code === "INVALID_CONTENT_TYPE"
      ? privateJson({ error: { code: result.code, message: "请使用 JSON 请求。", retryable: false } }, 415)
      : result.code === "PAYLOAD_TOO_LARGE"
        ? privateJson({ error: { code: result.code, message: "请求内容过大。", retryable: false } }, 413)
        : privateJson({ error: { code: result.code, message: "JSON 格式不正确。", retryable: false } }, 400);
  return { ok: false as const, response };
}

export function visitorSessionCookie(
  token: string,
  expiresAt: string,
  secure = process.env.NODE_ENV === "production",
) {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) throw new Error("invalid_session_cookie_expiry");
  return [
    `${VISITOR_SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=2592000",
    `Expires=${expires.toUTCString()}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearedVisitorSessionCookie(secure = process.env.NODE_ENV === "production") {
  return [
    `${VISITOR_SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function visitorSessionTokenFromRequest(request: Request) {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${VISITOR_SESSION_COOKIE_NAME}=`))
    .map((part) => part.slice(VISITOR_SESSION_COOKIE_NAME.length + 1));
  return matches.length === 1 ? matches[0] : null;
}

export function clientNetworkAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  const value = forwarded || direct;
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export async function visitorIdentityFromRequest(
  repository: VisitorIdentityRepository,
  request: Request,
  now = new Date(),
) {
  return getVisitorIdentityForSession(repository, visitorSessionTokenFromRequest(request), now);
}

export function withSessionCookie(response: Response, token: string, expiresAt: string) {
  response.headers.append("Set-Cookie", visitorSessionCookie(token, expiresAt));
  return response;
}

export function withClearedSessionCookie(response: Response) {
  response.headers.append("Set-Cookie", clearedVisitorSessionCookie());
  return response;
}
