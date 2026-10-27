import type { GuideAnswerClaim } from "../p0-core-types";
import {
  approvedKnowledgeAnswer,
  formalGuideFactType,
  isCurrentPublishedFormalGuideSnapshot,
  isDynamicSafetyOrOperationsQuestion,
  isEligibleFormalGuideKnowledge,
  isPromptInjectionAttempt,
  isStrictFormalGuideClaim,
  lexicalTokens,
  type FormalGuideAnswerRequest,
  type FormalGuideAnswerSource,
  type FormalGuideKnowledgeEntry,
  type FormalGuideKnowledgeRepository,
} from "./formal-guide-domain";

const MAX_MATCHED_ENTRIES = 3;
const MAX_CLAIMS = 6;

export type FormalGuideAnswer = Readonly<{
  schemaVersion: 1;
  scenicAreaId: string;
  snapshotRevision: number;
  answer: string;
  claims: readonly GuideAnswerClaim[];
  sources: readonly FormalGuideAnswerSource[];
  generatedAt: string;
  provider: "deterministic-published-knowledge";
}>;

export type ResolveFormalGuideAnswerResult =
  | { state: "AVAILABLE"; answer: FormalGuideAnswer }
  | { state: "FORMAL_GUIDE_UNAVAILABLE" }
  | { state: "PROMPT_INJECTION_REJECTED" }
  | { state: "DYNAMIC_OPERATIONAL_QUESTION" }
  | { state: "NO_SUPPORTED_KNOWLEDGE" };

type RankedEntry = {
  entry: FormalGuideKnowledgeEntry;
  answer: string;
  score: number;
};

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function scoreEntry(questionTokens: ReadonlySet<string>, questionNormalized: string, entry: FormalGuideKnowledgeEntry, answer: string) {
  const keyNormalized = entry.knowledgeKey.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const answerNormalized = answer.normalize("NFKC").toLocaleLowerCase("zh-CN");
  let score = intersectionSize(questionTokens, lexicalTokens(entry.knowledgeKey));
  score += intersectionSize(questionTokens, lexicalTokens(answer));
  if (questionNormalized.length >= 2 && keyNormalized.includes(questionNormalized)) score += 12;
  if (questionNormalized.length >= 2 && answerNormalized.includes(questionNormalized)) score += 8;
  return score;
}

function compareRankedEntries(left: RankedEntry, right: RankedEntry) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.entry.knowledgeKey !== right.entry.knowledgeKey) return left.entry.knowledgeKey < right.entry.knowledgeKey ? -1 : 1;
  if (left.entry.knowledgeId !== right.entry.knowledgeId) return left.entry.knowledgeId < right.entry.knowledgeId ? -1 : 1;
  return 0;
}

function sentencesFromApprovedAnswer(answer: string) {
  return answer
    .match(/[^。！？!?]+[。！？!?]?/gu)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 2) ?? [];
}

function claimForSentence(entry: FormalGuideKnowledgeEntry, sentence: string): GuideAnswerClaim | null {
  const factType = formalGuideFactType(entry.factType);
  if (!factType) return null;
  const text = `${sentence} [${entry.knowledgeId}]`;
  const claim: GuideAnswerClaim = { text, sourceId: entry.knowledgeId, factType };
  return isStrictFormalGuideClaim(claim) ? claim : null;
}

function sourcesForEntries(entries: readonly FormalGuideKnowledgeEntry[]): FormalGuideAnswerSource[] {
  const seen = new Set<string>();
  const sources: FormalGuideAnswerSource[] = [];
  for (const entry of entries) {
    if (seen.has(entry.knowledgeId)) continue;
    const factType = formalGuideFactType(entry.factType);
    if (!factType) continue;
    seen.add(entry.knowledgeId);
    sources.push({
      sourceId: entry.knowledgeId,
      sourceReference: entry.sourceReference,
      contentVersionId: entry.contentVersionId,
      contentRevision: entry.contentRevision,
      factType,
    });
  }
  return sources;
}

/**
 * Deterministically ranks only reviewed publishing records. It deliberately
 * does not call an LLM, map provider, embedding service, or operational API.
 */
export async function resolveFormalGuideAnswer(
  repository: FormalGuideKnowledgeRepository,
  input: FormalGuideAnswerRequest,
  now = new Date(),
): Promise<ResolveFormalGuideAnswerResult> {
  if (isPromptInjectionAttempt(input.question)) return { state: "PROMPT_INJECTION_REJECTED" };
  if (isDynamicSafetyOrOperationsQuestion(input.question)) return { state: "DYNAMIC_OPERATIONAL_QUESTION" };

  let snapshot;
  try {
    snapshot = await repository.readCurrentPublishedKnowledge(input.scenicAreaId, input.expectedSnapshotRevision);
  } catch {
    return { state: "FORMAL_GUIDE_UNAVAILABLE" };
  }
  if (!isCurrentPublishedFormalGuideSnapshot(snapshot, input.scenicAreaId, input.expectedSnapshotRevision, now)) {
    return { state: "FORMAL_GUIDE_UNAVAILABLE" };
  }

  const questionTokens = lexicalTokens(input.question);
  const questionNormalized = input.question.normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
  const eligible = snapshot.entries
    .filter((entry) => isEligibleFormalGuideKnowledge(entry, now))
    .map((entry) => ({ entry, answer: approvedKnowledgeAnswer(entry.bodyJson), score: 0 }))
    .filter((item): item is { entry: FormalGuideKnowledgeEntry; answer: string; score: number } => item.answer !== null)
    .map((item) => ({ ...item, score: scoreEntry(questionTokens, questionNormalized, item.entry, item.answer) }));

  if (eligible.length === 0) return { state: "FORMAL_GUIDE_UNAVAILABLE" };
  const selected = eligible.filter((item) => item.score > 0).sort(compareRankedEntries).slice(0, MAX_MATCHED_ENTRIES);
  if (selected.length === 0) return { state: "NO_SUPPORTED_KNOWLEDGE" };

  const claims = selected
    .flatMap((item) => sentencesFromApprovedAnswer(item.answer).map((sentence) => claimForSentence(item.entry, sentence)))
    .filter((claim): claim is GuideAnswerClaim => claim !== null)
    .slice(0, MAX_CLAIMS);
  if (claims.length === 0 || !claims.every(isStrictFormalGuideClaim)) return { state: "FORMAL_GUIDE_UNAVAILABLE" };

  const selectedEntryIds = new Set(claims.map((claim) => claim.sourceId));
  const sourceEntries = selected.map((item) => item.entry).filter((entry) => selectedEntryIds.has(entry.knowledgeId));
  const sources = sourcesForEntries(sourceEntries);
  if (sources.length === 0 || sources.some((source) => !selectedEntryIds.has(source.sourceId))) {
    return { state: "FORMAL_GUIDE_UNAVAILABLE" };
  }

  return {
    state: "AVAILABLE",
    answer: {
      schemaVersion: 1,
      scenicAreaId: input.scenicAreaId,
      snapshotRevision: snapshot.snapshotRevision,
      answer: claims.map((claim) => claim.text).join("\n\n"),
      claims,
      sources,
      generatedAt: now.toISOString(),
      provider: "deterministic-published-knowledge",
    },
  };
}
