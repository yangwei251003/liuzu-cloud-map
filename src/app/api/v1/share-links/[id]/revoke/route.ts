import { privateJson, readJsonBody, serverShareUnavailable } from "@/lib/server/share-link-http";
import { postgresShareLinkRepository } from "@/lib/server/share-link-repository";
import { revokeServerShare } from "@/lib/server/share-link-service";
import {
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

function revokeTokenFrom(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 0) return { valid: true as const, token: null };
  if (Object.keys(record).length === 1 && typeof record.revokeToken === "string") {
    return { valid: true as const, token: record.revokeToken };
  }
  return { valid: false as const, token: null };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unavailable = serverShareUnavailable() ?? visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;
  let visitor;
  try {
    visitor = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
  } catch {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
  if (!visitor) {
    return privateJson({ error: { code: "AUTH_REQUIRED", message: "撤销分享需要所有者游客会话。", retryable: false } }, 401);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const proof = revokeTokenFrom(body.value);
  if (!proof?.valid) {
    return privateJson({ error: { code: "INVALID_REVOCATION", message: "撤销请求格式不正确。", retryable: false } }, 400);
  }
  const { id } = await context.params;
  try {
    const result = await revokeServerShare(postgresShareLinkRepository, id, visitor, proof.token);
    if (result === "NOT_FOUND") {
      return privateJson({ error: { code: "NOT_FOUND", message: "分享或撤销凭证无效。", retryable: false } }, 404);
    }
    return privateJson({ schemaVersion: 1, state: "REVOKED", alreadyRevoked: result === "ALREADY_REVOKED" });
  } catch {
    return privateJson({ error: { code: "REVOKE_FAILED", message: "暂时无法撤销服务端分享。", retryable: true } }, 500);
  }
}
