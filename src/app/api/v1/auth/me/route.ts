import { privateJson } from "@/lib/server/share-link-http";
import {
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
  withClearedSessionCookie,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  try {
    const identity = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
    if (!identity) {
      return withClearedSessionCookie(
        privateJson(
          { error: { code: "AUTH_REQUIRED", message: "需要游客账号会话。", retryable: false } },
          401,
        ),
      );
    }
    return privateJson({
      schemaVersion: 1,
      visitor: {
        subject: identity.subject,
        scenicAreaId: identity.scenicAreaId,
        handle: identity.handle,
      },
    });
  } catch {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
}
