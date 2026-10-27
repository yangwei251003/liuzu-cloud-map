import { privateJson } from "@/lib/server/share-link-http";
import { parseConsentWriteInput } from "@/lib/server/visitor-data-rights-domain";
import { dataRightsAuthRequired, dataRightsIdempotencyFromRequest } from "@/lib/server/visitor-data-rights-http";
import { postgresVisitorDataRightsRepository } from "@/lib/server/visitor-data-rights-repository";
import { getVisitorConsents, writeVisitorConsent } from "@/lib/server/visitor-data-rights-service";
import {
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorAuthUnavailable,
  visitorIdentityFromRequest,
} from "@/lib/server/visitor-identity-http";
import { postgresVisitorIdentityRepository } from "@/lib/server/visitor-identity-repository";

export const runtime = "nodejs";

async function authenticatedVisitor(request: Request) {
  try {
    return await visitorIdentityFromRequest(postgresVisitorIdentityRepository, request);
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const visitor = await authenticatedVisitor(request);
  if (visitor === undefined) {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
  if (!visitor) return dataRightsAuthRequired();
  try {
    const consents = await getVisitorConsents(postgresVisitorDataRightsRepository, visitor);
    return privateJson({ schemaVersion: 1, consents });
  } catch {
    return privateJson({ error: { code: "CONSENT_UNAVAILABLE", message: "同意记录暂时不可用。", retryable: true } }, 503);
  }
}

export async function PUT(request: Request) {
  const unavailable = visitorAuthUnavailable();
  if (unavailable) return unavailable;
  const crossOrigin = sameOriginWriteError(request);
  if (crossOrigin) return crossOrigin;
  const visitor = await authenticatedVisitor(request);
  if (visitor === undefined) {
    return privateJson({ error: { code: "AUTH_UNAVAILABLE", message: "账号服务暂时不可用。", retryable: true } }, 500);
  }
  if (!visitor) return dataRightsAuthRequired();

  const body = await readVisitorAuthJson(request);
  if (!body.ok) return body.response;
  const consent = parseConsentWriteInput(body.value);
  if (!consent) {
    return privateJson({ error: { code: "INVALID_CONSENT", message: "同意记录格式不正确。", retryable: false } }, 400);
  }
  const idempotency = dataRightsIdempotencyFromRequest(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const result = await writeVisitorConsent(
      postgresVisitorDataRightsRepository,
      visitor,
      consent,
      idempotency.keyHash,
    );
    if (result.state === "ACCOUNT_NOT_FOUND") return dataRightsAuthRequired();
    if (result.state === "REVISION_CONFLICT") {
      return privateJson(
        {
          error: {
            code: "REVISION_CONFLICT",
            message: "同意记录已更新，请刷新后重试。",
            retryable: true,
            currentRevision: result.currentRevision,
          },
        },
        409,
      );
    }
    if (result.state === "IDEMPOTENCY_CONFLICT") {
      return privateJson({ error: { code: "IDEMPOTENCY_CONFLICT", message: "请求无法处理。", retryable: false } }, 409);
    }
    if (result.state === "APPLIED" || result.state === "REPLAYED") {
      return privateJson({ schemaVersion: 1, state: result.state, consent: result.consent });
    }
    return privateJson({ error: { code: "CONSENT_UNAVAILABLE", message: "同意记录暂时不可用。", retryable: true } }, 503);
  } catch {
    return privateJson({ error: { code: "CONSENT_UNAVAILABLE", message: "同意记录暂时不可用。", retryable: true } }, 503);
  }
}
