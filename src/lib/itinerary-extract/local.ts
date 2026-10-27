import { scenicSpots } from "../scenic-data";
import type {
  ExtractedItineraryStop,
  ExtractionConfidence,
  ItineraryAmbiguity,
  UnrecognizedFragment,
  UnresolvedIssue,
} from "./types";

const aliases: Record<string, string[]> = {
  "guoen-temple": ["国恩寺"],
  "huineng-residence": ["六祖惠能故居", "六祖故居", "惠能故居"],
  "zangfo-valley": ["藏佛坑候选区", "藏佛坑"],
  "longshan-spring": ["龙山温泉", "温泉"],
  "chanyu-town": ["禅域小镇", "禅域"],
};

const fuzzyCandidateTerms: Array<{ terms: string[]; candidateIds: string[]; reason: string }> = [
  {
    terms: ["六祖文化", "六祖故里", "六祖文化景点"],
    candidateIds: ["guoen-temple", "huineng-residence"],
    reason: "这段文字表达文化主题或片区意图，不能唯一指向一个已登记地点。",
  },
  {
    terms: ["禅文化体验", "禅文化景点"],
    candidateIds: ["guoen-temple", "chanyu-town"],
    reason: "这段文字可能指向宗教文化节点，也可能指向文化体验节点。",
  },
];

type BasicMatch = {
  id: string;
  name: string;
  alias: string;
  start: number;
  end: number;
  confidence: ExtractionConfidence;
  eligibleForRoute: boolean;
  reviewNote: string;
};

type DurationMatch = { start: number; end: number; minutes: number };

function parseChineseNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    const result = (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
    return Number.isFinite(result) ? result : null;
  }
  return digits[value] ?? null;
}

function durations(text: string): DurationMatch[] {
  const matches: DurationMatch[] = [];
  for (const match of text.matchAll(/([一二两三四五六七八九十\d]+)\s*(?:个)?(小时|分钟)|半\s*(?:个)?小时/g)) {
    if (match.index === undefined) continue;
    const minutes = match[0].includes("半")
      ? 30
      : (() => {
          const numeric = parseChineseNumber(match[1]);
          if (numeric === null) return null;
          return match[2] === "小时" ? numeric * 60 : numeric;
        })();
    if (minutes === null || minutes < 10 || minutes > 240) continue;
    matches.push({ start: match.index, end: match.index + match[0].length, minutes });
  }
  return matches;
}

function sentenceRange(text: string, start: number, end: number): [number, number] {
  const hardSeparators = ["。", "！", "？", ".", "!", "?", "；", ";", "\n"];
  const previous = Math.max(-1, ...hardSeparators.map((separator) => text.lastIndexOf(separator, start - 1)));
  const next = hardSeparators.map((separator) => text.indexOf(separator, end)).filter((index) => index >= 0);
  return [previous + 1, next.length ? Math.min(...next) : text.length];
}

function distanceBetween(startA: number, endA: number, startB: number, endB: number): number {
  if (startA >= endB) return startA - endB;
  if (startB >= endA) return startB - endA;
  return 0;
}

function assignDurations(text: string, matches: BasicMatch[]): Map<string, number> {
  const assigned = new Map<string, DurationMatch[]>();
  for (const duration of durations(text)) {
    const candidates = matches.flatMap((item) => {
      const [sentenceStart, sentenceEnd] = sentenceRange(text, item.start, item.end);
      if (duration.start < sentenceStart || duration.end > sentenceEnd) return [];
      const distance = distanceBetween(item.start, item.end, duration.start, duration.end);
      return distance <= 32 ? [{ item, distance }] : [];
    }).sort((a, b) => a.distance - b.distance);
    if (!candidates.length || (candidates[1] && candidates[0].distance === candidates[1].distance)) continue;
    const current = assigned.get(candidates[0].item.id) ?? [];
    assigned.set(candidates[0].item.id, [...current, duration]);
  }

  const result = new Map<string, number>();
  for (const [id, items] of assigned) {
    if (items.length === 1) result.set(id, items[0].minutes);
  }
  return result;
}

function evidenceAround(text: string, start: number, end: number): { evidence: string; start: number; end: number } {
  const separators = ["，", "。", "；", ",", ".", ";", "！", "？", "!", "?", "\n"];
  const previous = Math.max(-1, ...separators.map((separator) => text.lastIndexOf(separator, start - 1)));
  const next = separators.map((separator) => text.indexOf(separator, end)).filter((index) => index >= 0);
  let evidenceStart = previous + 1;
  let evidenceEnd = next.length ? Math.min(...next) : text.length;
  while (evidenceStart < evidenceEnd && /\s/.test(text[evidenceStart])) evidenceStart += 1;
  while (evidenceEnd > evidenceStart && /\s/.test(text[evidenceEnd - 1])) evidenceEnd -= 1;
  if (evidenceEnd - evidenceStart > 160) {
    evidenceStart = Math.max(evidenceStart, start - 50);
    evidenceEnd = Math.min(evidenceEnd, end + 90);
  }
  return { evidence: text.slice(evidenceStart, evidenceEnd), start: evidenceStart, end: evidenceEnd };
}

function clauses(text: string) {
  const result: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /[^，。；,.!?！？;\n]+/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const leading = match[0].length - match[0].trimStart().length;
    const value = match[0].trim();
    if (!value) continue;
    const start = match.index + leading;
    result.push({ text: value, start, end: start + value.length });
  }
  return result;
}

export function extractKnownStops(text: string): ExtractedItineraryStop[] {
  const candidates: BasicMatch[] = scenicSpots.flatMap((spot) => {
    const names = aliases[spot.id] ?? [spot.name];
    const found = names
      .map((alias) => ({ alias, start: text.indexOf(alias) }))
      .filter((match) => match.start >= 0)
      .sort((a, b) => a.start - b.start || b.alias.length - a.alias.length)[0];
    if (!found) return [];

    const end = found.start + found.alias.length;
    const confidence: ExtractionConfidence = found.alias === spot.name ? "EXPLICIT" : "ALIAS";
    const eligibleForRoute = spot.id !== "zangfo-valley";

    return [{
      id: spot.id,
      name: spot.name,
      alias: found.alias,
      start: found.start,
      end,
      confidence,
      eligibleForRoute,
      reviewNote: eligibleForRoute
        ? "候选点位与停留时间需由游客确认。"
        : "藏佛坑存在点位消歧与现场安全缺口，不能进入自动执行路线。",
    }];
  });

  const sorted = candidates.sort((a, b) => a.start - b.start);
  const dwellByStop = assignDurations(text, sorted);
  return sorted.map((item) => {
    const evidence = evidenceAround(text, item.start, item.end);
    return {
      id: item.id,
      name: item.name,
      ...evidence,
      confidence: item.confidence,
      eligibleForRoute: item.eligibleForRoute,
      reviewNote: item.reviewNote,
      dwellMinutes: dwellByStop.get(item.id) ?? null,
    };
  });
}

export function extractItineraryCandidates(text: string): {
  stops: ExtractedItineraryStop[];
  ambiguities: ItineraryAmbiguity[];
} {
  const stops = extractKnownStops(text);
  const ambiguities: ItineraryAmbiguity[] = [];
  for (const group of fuzzyCandidateTerms) {
    for (const term of [...group.terms].sort((a, b) => b.length - a.length)) {
      let cursor = 0;
      while (cursor < text.length) {
        const start = text.indexOf(term, cursor);
        if (start < 0) break;
        const end = start + term.length;
        const candidates = group.candidateIds.flatMap((id) => {
          const spot = scenicSpots.find((item) => item.id === id);
          return spot ? [{
            id: spot.id,
            name: spot.name,
            confidence: "FUZZY" as const,
            eligibleForRoute: spot.id !== "zangfo-valley",
            reviewNote: "此候选来自模糊主题表达，必须由游客明确选择后才能进入站序。",
          }] : [];
        });
        const overlapsExisting = ambiguities.some((item) => start < item.end && end > item.start);
        if (candidates.length > 1 && !overlapsExisting) {
          ambiguities.push({
            id: `ambiguity-${start}-${end}-${ambiguities.length + 1}`,
            evidence: text.slice(start, end),
            start,
            end,
            reason: group.reason,
            status: "UNRESOLVED",
            candidates,
          });
        }
        cursor = end;
      }
    }
  }
  return { stops, ambiguities: ambiguities.sort((a, b) => a.start - b.start) };
}

export function analyzeItineraryText(
  text: string,
  stops: ExtractedItineraryStop[],
  ambiguities: ItineraryAmbiguity[] = [],
): { unrecognizedFragments: UnrecognizedFragment[]; unresolved: UnresolvedIssue[] } {
  const actionable = /(去|到|前往|参观|看看|游览|经过|抵达|吃|用餐|午饭|晚饭|住宿|停车|接驳|返程|休息)/;
  const unrecognizedFragments = clauses(text).flatMap((fragment) => {
    const overlapsKnownStop = stops.some((stop) => fragment.start < stop.end && fragment.end > stop.start);
    const overlapsAmbiguity = ambiguities.some((item) => fragment.start < item.end && fragment.end > item.start);
    if (overlapsKnownStop || overlapsAmbiguity || !actionable.test(fragment.text)) return [];
    return [{ ...fragment, reason: "UNKNOWN_PLACE_OR_ACTIVITY" as const }];
  });

  const unresolved: UnresolvedIssue[] = [];
  const push = (issue: Omit<UnresolvedIssue, "id" | "blocking" | "status" | "resolution">) => unresolved.push({
    ...issue,
    id: `unresolved-${issue.type.toLowerCase()}-${issue.start}-${unresolved.length + 1}`,
    blocking: true,
    status: "UNRESOLVED",
    resolution: null,
  });

  for (const stop of stops) {
    if (stop.dwellMinutes === null) {
      push({
        type: "DWELL_TIME",
        evidence: stop.evidence,
        message: `${stop.name}没有可靠的停留时长，请游客自行确认；系统不会套用候选默认值。`,
        stopId: stop.id,
        start: stop.start,
        end: stop.end,
      });
    }
  }

  for (const match of text.matchAll(/上午|中午|午后|下午|傍晚|晚上|清晨|凌晨|早上|第[一二三四五六七八九十\d]+天|\d{1,2}[:：]\d{2}/g)) {
    if (match.index === undefined) continue;
    push({
      type: "TIME_WINDOW",
      evidence: match[0],
      message: `时间表达“${match[0]}”尚未转换为可执行时间窗。`,
      stopId: null,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  const constraintPattern = /(长辈|老人|儿童|孩子|婴儿|轮椅|无障碍|少走路|不爬坡|体力|过敏|孕妇|宠物|行李|赶车|返程|必须|希望)/;
  for (const fragment of clauses(text)) {
    if (!constraintPattern.test(fragment.text)) continue;
    push({
      type: "ACTION_CONSTRAINT",
      evidence: fragment.text,
      message: `行动约束“${fragment.text}”尚未获得路线、设施或可达性证据。`,
      stopId: null,
      start: fragment.start,
      end: fragment.end,
    });
  }

  for (const fragment of unrecognizedFragments) {
    push({
      type: "UNKNOWN_FRAGMENT",
      evidence: fragment.text,
      message: `片段“${fragment.text}”未匹配到已登记地点或结构化活动。`,
      stopId: null,
      start: fragment.start,
      end: fragment.end,
    });
  }

  return { unrecognizedFragments, unresolved };
}

export function itineraryAliases() {
  return aliases;
}
