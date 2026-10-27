import { extractWithGemini } from "./gemini.server";
import { analyzeItineraryText, extractItineraryCandidates } from "./local";
import type { ItineraryExtraction } from "./types";

export async function extractItinerary(text: string, requestId: string, allowRemote = false): Promise<ItineraryExtraction> {
  const modelStops = allowRemote ? await extractWithGemini(text) : undefined;
  const local = extractItineraryCandidates(text);
  const stops = modelStops ?? local.stops;
  const analysis = analyzeItineraryText(text, stops, local.ambiguities);
  const hasExcluded = stops.some((stop) => !stop.eligibleForRoute);

  return {
    requestId,
    mode: modelStops ? "MODEL_GROUNDED" : "LOCAL_RULES",
    status: "REVIEW_REQUIRED",
    stops,
    ambiguities: local.ambiguities,
    ...analysis,
    warnings: [
      "结果只包含已登记候选点，地点、顺序和停留时间必须由游客确认。",
      "道路、入口、开放状态和安全信息不由文本提取结果决定。",
      ...(hasExcluded ? ["存在不可自动执行的候选点，已标记并阻止进入路线。"] : []),
    ],
  };
}
