import { privateJson } from "@/lib/server/share-link-http";
import { parseDeleteVisitorAccountInput } from "@/lib/server/visitor-data-rights-domain";
import {
  dataRightsAuthRequired,
  dataRightsIdempotencyFromRequest,
  withDeletedAccountClientStateCleared,
} from "@/lib/server/visitor-data-rights-http";
import { postgresVisitorDataRightsRepository } from "@/lib/server/visitor-data-rights-repository";
import { deleteVisitorAccount } from "@/lib/server/visitor-data-rights-service";
import {
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
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
  const deletion = parseDeleteVisitorAccountInput(body.value);
  if (!deletion) {
    return privateJson({ error: { code: "REQUEST_REJECTED", message: "请求无法处理。", retryable: false } }, 400);
  }
  const idempotency = dataRightsIdempotencyFromRequest(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const result = await deleteVisitorAccount(
      postgresVisitorIdentityRepository,
      postgresVisitorDataRightsRepository,
      visitor,
      deletion.currentPassphrase,
      idempotency.keyHash,
    );
    if (result.state === "REAUTH_FAILED") {
      return privateJson({ error: { code: "REAUTH_REQUIRED", message: "无法确认当前凭证。", retryable: false } }, 401);
    }
    if (result.state === "ACCOUNT_NOT_FOUND") return dataRightsAuthRequired();
    if (result.state === "IDEMPOTENCY_CONFLICT") {
      return privateJson({ error: { code: "IDEMPOTENCY_CONFLICT", message: "请求无法处理。", retryable: false } }, 409);
    }
    if (result.state === "DELETED") {
      return withDeletedAccountClientStateCleared(
        privateJson({ schemaVersion: 1, state: "ACCOUNT_DELETED", receipt: result.receipt }),
      );
    }
    return privateJson({ error: { code: "DELETE_UNAVAILABLE", message: "账号注销暂时不可用。", retryable: true } }, 503);
  } catch {
    return privateJson({ error: { code: "DELETE_UNAVAILABLE", message: "账号注销暂时不可用。", retryable: true } }, 503);
  }
}
