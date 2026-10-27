import { privateJson, readJsonBody, serverShareUnavailable } from "@/lib/server/share-link-http";
import { parseShareResolveInput } from "@/lib/server/share-link-resolve";
import { postgresShareLinkRepository } from "@/lib/server/share-link-repository";
import { readServerShare } from "@/lib/server/share-link-service";
import { sameOriginWriteError } from "@/lib/server/visitor-identity-http";

export const runtime = "nodejs";

const RESOLVE_JSON_LIMIT_BYTES = 512;

export async function POST(request: Request) {
  const unavailable = serverShareUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;
  const body = await readJsonBody(request, RESOLVE_JSON_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const input = parseShareResolveInput(body.value);
  if (!input) {
    return privateJson({ error: { code: "INVALID_SHARE", message: "分享凭据格式不正确。", retryable: false } }, 400);
  }
  try {
    const result = await readServerShare(postgresShareLinkRepository, input.token);
    if (result.state === "ACTIVE") {
      return privateJson({
        schemaVersion: 1,
        state: result.state,
        shareId: result.id,
        scenicAreaId: result.scenicAreaId,
        route: result.payload,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt,
      });
    }
    if (result.state === "EXPIRED" || result.state === "REVOKED") {
      return privateJson({ error: { code: result.state, message: "该分享已失效。", retryable: false } }, 410);
    }
    return privateJson({ error: { code: "NOT_FOUND", message: "未找到可用分享。", retryable: false } }, 404);
  } catch {
    return privateJson({ error: { code: "READ_FAILED", message: "暂时无法读取服务端分享。", retryable: true } }, 500);
  }
}
