import { privateJson } from "@/lib/server/share-link-http";
import {
  dataRightsAuthRequired,
  dataRightsIdempotencyFromRequest,
} from "@/lib/server/visitor-data-rights-http";
import { isEmptyDataRightsRequest } from "@/lib/server/visitor-data-rights-domain";
import { postgresVisitorDataRightsRepository } from "@/lib/server/visitor-data-rights-repository";
import { exportVisitorData } from "@/lib/server/visitor-data-rights-service";
import {
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;

  let visitor;
  try {
    visitor = await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
  } catch {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
  if (!visitor) return dataRightsAuthRequired();

  const body = await readVisitorAuthJson(request);
  if (!body.ok) return body.response;
  if (!isEmptyDataRightsRequest(body.value)) {
    return privateJson({ error: { code: "REQUEST_REJECTED", message: "请求无法处理。", retryable: false } }, 400);
  }
  const idempotency = dataRightsIdempotencyFromRequest(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const result = await exportVisitorData(postgresVisitorDataRightsRepository, visitor, idempotency.keyHash);
    if (result.state === "ACCOUNT_NOT_FOUND") return dataRightsAuthRequired();
    if (result.state === "IDEMPOTENCY_CONFLICT") {
      return privateJson({ error: { code: "IDEMPOTENCY_CONFLICT", message: "请求无法处理。", retryable: false } }, 409);
    }
    if (result.state === "COMPLETED" || result.state === "REPLAYED") {
      return privateJson({ schemaVersion: 1, state: result.state, export: result.data });
    }
    return privateJson({ error: { code: "EXPORT_UNAVAILABLE", message: "数据导出暂时不可用。", retryable: true } }, 503);
  } catch {
    return privateJson({ error: { code: "EXPORT_UNAVAILABLE", message: "数据导出暂时不可用。", retryable: true } }, 503);
  }
}
