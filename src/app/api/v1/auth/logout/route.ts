import { privateJson } from "@/lib/server/share-link-http";
import {
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorSessionTokenFromRequest,
  withClearedSessionCookie,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";
import { logoutVisitorSession } from "@/lib/server/visitor-identity-service";

export const runtime = "nodejs";

function isEmptyObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

export async function POST(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;
  const body = await readVisitorAuthJson(request);
  if (!body.ok) return body.response;
  if (!isEmptyObject(body.value)) {
    return privateJson({ error: { code: "REQUEST_REJECTED", message: "请求无法处理。", retryable: false } }, 400);
  }

  try {
    await logoutVisitorSession(postgresVisitorIdentityRepository, visitorSessionTokenFromRequest(request));
    return withClearedSessionCookie(privateJson({ schemaVersion: 1, state: "SIGNED_OUT" }));
  } catch {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
}
