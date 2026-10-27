import { handleFormalGuideAnswerRequest } from "@/lib/server/formal-guide-http";
import { postgresFormalGuideKnowledgeRepository } from "@/lib/server/formal-guide-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Production wiring intentionally uses the database-backed, published-only
 * repository. Missing database configuration resolves to a stable 503 rather
 * than candidate knowledge, a remote model, or a hard-coded fallback.
 */
export async function POST(request: Request) {
  return handleFormalGuideAnswerRequest(request, postgresFormalGuideKnowledgeRepository);
}
