import { privateJson } from "@/lib/server/share-link-http";
import { isReadinessAuthorized, liveReadiness } from "@/lib/server/readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isReadinessAuthorized(request)) {
    return privateJson({ error: { code: "READINESS_AUTH_REQUIRED", retryable: false } }, 401);
  }
  const result = await liveReadiness();
  return privateJson(result, result.status === "READY" ? 200 : 503);
}
