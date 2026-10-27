import { randomUUID } from "node:crypto";
import {
  asksForDynamicOrSafetyFact,
  evidenceBoundarySource,
  getUnknownFactAnswer,
  retrieveGuideKnowledge,
} from "./knowledge";
import { generateGroundedAnswerClaims } from "./gemini.server";
import { isGuideAnswerClaim } from "./types";
import type { AIGuideAnswer, AIGuideFactType, AIGuideSource, GuideAnswerClaim } from "./types";

function dedupeSources(sources: AIGuideSource[]) {
  return Array.from(new Map(sources.map((source) => [source.id, source])).values());
}

function localClaims(items: ReturnType<typeof retrieveGuideKnowledge>): GuideAnswerClaim[] | null {
  const claims = items.map((item) => ({
    text: item.safeAnswer,
    sourceIds: item.sources.map((source) => source.id),
    factTypes: [item.factType],
  }));
  return claims.every(isGuideAnswerClaim) ? claims : null;
}

function answerFromClaims(claims: GuideAnswerClaim[]) {
  return claims.map((claim) => claim.text).join("\n\n");
}

function refusalClaim(text: string, factTypes: AIGuideFactType[]): GuideAnswerClaim {
  return { text, sourceIds: [evidenceBoundarySource.id], factTypes };
}

function internalEvidenceRefusal(requestId: string, generatedAt: string, notice: string): AIGuideAnswer {
  const answer =
    "已登记知识的来源标记未通过完整性校验，我不会输出可能失去依据的讲解。[BOUNDARY-2026-08-14]";
  return {
    requestId,
    answer,
    claims: [refusalClaim(answer, ["realtime_status"])],
    factTypes: [],
    sources: [evidenceBoundarySource],
    provider: "local-knowledge",
    verification: "limited",
    refused: true,
    generatedAt,
    notice,
  };
}

export async function answerGuideQuestion(
  question: string,
  spotId?: string,
  options: { allowRemote?: boolean; requestId?: string } = {},
): Promise<AIGuideAnswer> {
  const requestId = options.requestId && /^[a-z0-9-]{8,100}$/i.test(options.requestId) ? options.requestId : randomUUID();
  const generatedAt = new Date().toISOString();
  const notice = "AI 仅整理已登记资料；开放、路线和现场规则以最新官方信息为准。";

  if (asksForDynamicOrSafetyFact(question)) {
    const answer = getUnknownFactAnswer(question);
    return {
      requestId,
      answer,
      claims: [refusalClaim(answer, ["realtime_status"])],
      factTypes: ["realtime_status"],
      sources: [evidenceBoundarySource],
      provider: "local-knowledge",
      verification: "limited",
      refused: true,
      generatedAt,
      notice,
    };
  }

  const items = retrieveGuideKnowledge(question, spotId);
  if (items.length === 0) {
    const answer =
      "现有已审核知识还不能支持这个问题，我不会根据模型记忆补写。你可以问国恩寺的文保身份、六祖传说的非遗分类，或六祖镇与度假区的范围关系。[BOUNDARY-2026-08-14]";
    return {
      requestId,
      answer,
      claims: [refusalClaim(answer, ["realtime_status"])],
      factTypes: [],
      sources: [evidenceBoundarySource],
      provider: "local-knowledge",
      verification: "limited",
      refused: true,
      generatedAt,
      notice,
    };
  }

  const sources = dedupeSources(items.flatMap((item) => item.sources));
  const factTypes = Array.from(new Set(items.map((item) => item.factType)));
  const remoteClaims = options.allowRemote === true ? await generateGroundedAnswerClaims(question, items) : undefined;
  const claims = remoteClaims ?? localClaims(items);
  if (!claims) return internalEvidenceRefusal(requestId, generatedAt, notice);

  return {
    requestId,
    answer: answerFromClaims(claims),
    claims,
    factTypes,
    sources,
    provider: remoteClaims ? "gemini-assisted" : "local-knowledge",
    verification: "verified-context",
    refused: false,
    generatedAt,
    notice,
  };
}
