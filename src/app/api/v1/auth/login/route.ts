import { privateJson } from "@/lib/server/share-link-http";
import { getVisitorAuthRateLimitPepper } from "@/lib/server/visitor-identity-capability";
import {
  clientNetworkAddress,
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorAuthUnavailable,
  withSessionCookie,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";
import { loginVisitor } from "@/lib/server/visitor-identity-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;
  const body = await readVisitorAuthJson(request);
  if (!body.ok) return body.response;

  try {
    const result = await loginVisitor(postgresVisitorIdentityRepository, body.value, {
      pepper: getVisitorAuthRateLimitPepper(),
      clientNetworkAddress: clientNetworkAddress(request),
    });
    if (result.state === "RATE_LIMITED") {
      const response = privateJson(
        { error: { code: "AUTH_REJECTED", message: "暂时无法完成请求，请稍后再试。", retryable: true } },
        429,
      );
      response.headers.set("Retry-After", "900");
      return response;
    }
    if (result.state !== "AUTHENTICATED") {
      return privateJson(
        { error: { code: "AUTH_REJECTED", message: "账号信息不正确或暂时不可用。", retryable: false } },
        401,
      );
    }
    return withSessionCookie(
      privateJson({
        schemaVersion: 1,
        visitor: {
          subject: result.identity.subject,
          scenicAreaId: result.identity.scenicAreaId,
          handle: result.identity.handle,
        },
        expiresAt: result.expiresAt,
      }),
      result.sessionToken,
      result.expiresAt,
    );
  } catch {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
}
