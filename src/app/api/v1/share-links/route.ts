import { parseCreateServerShareInput } from "@/lib/server/share-link-domain";
import { privateJson, readJsonBody, serverShareUnavailable } from "@/lib/server/share-link-http";
import { postgresShareLinkRepository } from "@/lib/server/share-link-repository";
import { createServerShare } from "@/lib/server/share-link-service";
import {
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    return privateJson({ error: { code: "AUTH_REQUIRED", message: "创建跨设备分享需要游客账号会话。", retryable: false } }, 401);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const input = parseCreateServerShareInput(body.value);
  if (!input) {
    return privateJson({ error: { code: "INVALID_SHARE", message: "分享路线格式不正确或包含未允许字段。", retryable: false } }, 400);
  }
  try {
    const result = await createServerShare(postgresShareLinkRepository, input, visitor);
    return privateJson(
      {
        schemaVersion: 2,
        mode: "AUTHENTICATED_SERVER",
        shareId: result.id,
        shareToken: result.publicToken,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt,
        warning: "链接凭据只在当前页面内存中用于复制，不会写入本机分享索引。",
      },
      201,
    );
  } catch {
    return privateJson({ error: { code: "CREATE_FAILED", message: "服务端分享创建失败，请稍后重试。", retryable: true } }, 500);
  }
}
