import {
  type PersonalRouteCompanion,
  type PersonalRouteDuration,
  type PersonalRouteInput,
  type PersonalRouteInterest,
  type PersonalRoutePace,
} from "./personal-route-builder";

export type PersonalRouteIntentResult =
  | { ok: true; input: PersonalRouteInput; inferred: string[] }
  | { ok: false; error: string };

const INTEREST_PATTERNS: Array<[PersonalRouteInterest, RegExp]> = [
  ["禅文化", /禅|寺|佛教|文化/],
  ["人物故事", /人物|故事|六祖|惠能/],
  ["历史", /历史|古迹|古建|人文/],
  ["自然", /自然|山水|风景|森林|溪|泉/],
  ["摄影", /摄影|拍照|出片|打卡/],
  ["亲子", /亲子|孩子|儿童|小朋友/],
  ["休闲放松", /轻松|休闲|放松|慢游|不累|少走/],
  ["互动体验", /互动|体验|活动|研学/],
];

function readDuration(prompt: string): PersonalRouteDuration | null {
  if (/半天|四\s*(?:个)?小时|4\s*(?:h|小时)/i.test(prompt)) return "半天";
  if (/三\s*(?:个)?小时|3\s*(?:h|小时)/i.test(prompt)) return "3小时";
  if (/两\s*(?:个)?小时|二\s*(?:个)?小时|2\s*(?:h|小时)/i.test(prompt)) return "2小时";
  return null;
}

function readPace(prompt: string): PersonalRoutePace | null {
  if (/轻松|慢游|不赶|不累|少走|悠闲/.test(prompt)) return "轻松";
  if (/深度|细看|深入|文化为主/.test(prompt)) return "深度";
  if (/均衡|适中|正常节奏/.test(prompt)) return "均衡";
  return null;
}

function readCompanion(prompt: string): PersonalRouteCompanion | null {
  if (/长辈|老人|老年|父母/.test(prompt)) return "长辈同行";
  if (/亲子|孩子|儿童|小朋友/.test(prompt)) return "亲子";
  if (/朋友|好友|同学|同事/.test(prompt)) return "朋友同行";
  if (/独自|一个人|自己去|单人/.test(prompt)) return "独自";
  return null;
}

export function interpretPersonalRoutePrompt(value: unknown): PersonalRouteIntentResult {
  if (typeof value !== "string") return { ok: false, error: "请输入一句游览需求。" };
  const prompt = value.trim();
  if (prompt.length < 2 || prompt.length > 300) return { ok: false, error: "游览需求请控制在 2–300 字。" };
  if (/(?:一|1)\s*(?:个)?小时|90\s*分钟/.test(prompt)) {
    return { ok: false, error: "当前逐站路线至少需要 2 小时；可以改为单个景点导航，或把时间调整为 2 小时以上。" };
  }

  const inferred: string[] = [];
  const duration = readDuration(prompt) ?? "3小时";
  if (!readDuration(prompt)) inferred.push("未识别明确时长，按 3 小时生成");
  const pace = readPace(prompt) ?? "均衡";
  if (!readPace(prompt)) inferred.push("未识别明确节奏，按均衡生成");
  const companion = readCompanion(prompt) ?? "独自";
  if (!readCompanion(prompt)) inferred.push("未识别同行人，按独自生成");
  const interests = INTEREST_PATTERNS
    .filter(([, pattern]) => pattern.test(prompt))
    .map(([interest]) => interest);
  const uniqueInterests = Array.from(new Set(interests));
  if (!uniqueInterests.length) {
    uniqueInterests.push("休闲放松");
    inferred.push("未识别明确兴趣，按休闲放松生成");
  }

  return { ok: true, input: { duration, pace, companion, interests: uniqueInterests }, inferred };
}
