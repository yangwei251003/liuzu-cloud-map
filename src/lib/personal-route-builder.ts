import { scenicSpots, type ScenicSpot } from "./scenic-data";

export const PERSONAL_ROUTE_DURATIONS = ["2小时", "3小时", "半天"] as const;
export const PERSONAL_ROUTE_PACES = ["轻松", "均衡", "深度"] as const;
export const PERSONAL_ROUTE_COMPANIONS = ["独自", "亲子", "长辈同行", "朋友同行"] as const;
export const PERSONAL_ROUTE_INTERESTS = ["禅文化", "人物故事", "历史", "自然", "摄影", "亲子", "休闲放松", "互动体验"] as const;

export type PersonalRouteDuration = (typeof PERSONAL_ROUTE_DURATIONS)[number];
export type PersonalRoutePace = (typeof PERSONAL_ROUTE_PACES)[number];
export type PersonalRouteCompanion = (typeof PERSONAL_ROUTE_COMPANIONS)[number];
export type PersonalRouteInterest = (typeof PERSONAL_ROUTE_INTERESTS)[number];

export type PersonalRouteInput = {
  duration: PersonalRouteDuration;
  pace: PersonalRoutePace;
  companion: PersonalRouteCompanion;
  interests: readonly PersonalRouteInterest[];
};

export type PersonalRouteStop = Pick<ScenicSpot, "id" | "name" | "subtitle" | "verification"> & {
  dwellMinutes: number;
  reason: string;
};

export type PersonalRoutePlan = {
  title: string;
  summary: string;
  input: PersonalRouteInput;
  stops: PersonalRouteStop[];
  totalDwellMinutes: number;
  availableMinutes: number;
  status: "DEMO_ONLY";
  boundaryNotes: string[];
  legacyGuideHref: string;
};

export type PersonalRouteBuildResult =
  | { ok: true; plan: PersonalRoutePlan }
  | { ok: false; error: string };

type SpotProfile = {
  id: string;
  baseDwellMinutes: number;
  interests: PersonalRouteInterest[];
  companions: PersonalRouteCompanion[];
  deepCulture: boolean;
  slowFriendly: boolean;
};

const spotProfiles: SpotProfile[] = [
  {
    id: "guoen-temple",
    baseDwellMinutes: 60,
    interests: ["禅文化", "人物故事", "历史"],
    companions: ["独自", "长辈同行"],
    deepCulture: true,
    slowFriendly: true,
  },
  {
    id: "huineng-residence",
    baseDwellMinutes: 40,
    interests: ["禅文化", "人物故事", "历史", "亲子", "互动体验"],
    companions: ["独自", "亲子"],
    deepCulture: true,
    slowFriendly: false,
  },
  {
    id: "longshan-spring",
    baseDwellMinutes: 55,
    interests: ["自然", "摄影", "休闲放松"],
    companions: ["长辈同行", "朋友同行"],
    deepCulture: false,
    slowFriendly: true,
  },
  {
    id: "chanyu-town",
    baseDwellMinutes: 45,
    interests: ["摄影", "亲子", "互动体验", "休闲放松"],
    companions: ["亲子", "朋友同行"],
    deepCulture: false,
    slowFriendly: true,
  },
];

const durationMinutes: Record<PersonalRouteDuration, number> = {
  "2小时": 120,
  "3小时": 180,
  "半天": 240,
};

const durationStopLimit: Record<PersonalRouteDuration, number> = {
  "2小时": 2,
  "3小时": 3,
  "半天": 4,
};

const paceMultiplier: Record<PersonalRoutePace, number> = {
  轻松: 0.9,
  均衡: 1,
  深度: 1.25,
};

const companionReason: Record<PersonalRouteCompanion, string> = {
  独自: "响应独自探索偏好",
  亲子: "响应亲子故事与互动偏好",
  长辈同行: "响应少点慢游偏好；无障碍仍待现场核验",
  朋友同行: "响应同行交流与休闲偏好",
};

const recommendationDefinitions = [
  {
    id: "zen-origin",
    eyebrow: "初次到访",
    title: "寻源半日线",
    input: { duration: "3小时", pace: "深度", companion: "独自", interests: ["禅文化", "人物故事"] },
  },
  {
    id: "slow-travel",
    eyebrow: "轻松漫游",
    title: "休闲慢游线",
    input: { duration: "半天", pace: "轻松", companion: "长辈同行", interests: ["休闲放松"] },
  },
  {
    id: "family",
    eyebrow: "亲子同行",
    title: "小荔故事线",
    input: { duration: "3小时", pace: "均衡", companion: "亲子", interests: ["人物故事", "互动体验"] },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  eyebrow: string;
  title: string;
  input: PersonalRouteInput;
}>;

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function normalizeInput(input: PersonalRouteInput): PersonalRouteInput | null {
  if (
    !includesValue(PERSONAL_ROUTE_DURATIONS, input.duration) ||
    !includesValue(PERSONAL_ROUTE_PACES, input.pace) ||
    !includesValue(PERSONAL_ROUTE_COMPANIONS, input.companion) ||
    !Array.isArray(input.interests) ||
    input.interests.length === 0 ||
    input.interests.some((interest) => !includesValue(PERSONAL_ROUTE_INTERESTS, interest))
  ) {
    return null;
  }
  const interests = Array.from(new Set(input.interests));
  if (interests.length > PERSONAL_ROUTE_INTERESTS.length) return null;
  return { duration: input.duration, pace: input.pace, companion: input.companion, interests };
}

function dwellMinutes(profile: SpotProfile, pace: PersonalRoutePace) {
  return Math.max(20, Math.round((profile.baseDwellMinutes * paceMultiplier[pace]) / 5) * 5);
}

function scoreProfile(profile: SpotProfile, input: PersonalRouteInput) {
  const interestMatches = input.interests.filter((interest) => profile.interests.includes(interest)).length;
  const companionMatch = profile.companions.includes(input.companion) ? 1 : 0;
  const paceMatch = input.pace === "深度" && profile.deepCulture ? 1 : input.pace === "轻松" && profile.slowFriendly ? 1 : 0;
  return interestMatches * 10 + companionMatch * 4 + paceMatch * 3;
}

function reasonFor(profile: SpotProfile, input: PersonalRouteInput) {
  const matchedInterests = input.interests.filter((interest) => profile.interests.includes(interest));
  const reasons = matchedInterests.length
    ? [`匹配你选择的${matchedInterests.map((interest) => `“${interest}”`).join("、")}`]
    : ["用于补足路线节奏与候选点多样性"];
  if (profile.companions.includes(input.companion)) reasons.push(companionReason[input.companion]);
  if (input.pace === "深度" && profile.deepCulture) reasons.push("深度节奏优先保留文化候选点的停留时间");
  if (input.pace === "轻松" && profile.slowFriendly) reasons.push("轻松节奏减少站点密度");
  return `${reasons.join("；")}。这是产品偏好解释，不是现场适游或安全结论。`;
}

function makeTitle(input: PersonalRouteInput) {
  const interest = input.interests.length === 1 ? input.interests[0] : `${input.interests[0]}等${input.interests.length}项兴趣`;
  return `${interest} · ${input.duration}候选线`;
}

function build(input: PersonalRouteInput, title?: string): PersonalRouteBuildResult {
  const normalized = normalizeInput(input);
  if (!normalized) return { ok: false, error: "路线偏好不完整或包含未知选项，请重新选择。" };

  const availableMinutes = durationMinutes[normalized.duration];
  const limit = Math.max(2, durationStopLimit[normalized.duration] - (normalized.pace === "轻松" ? 1 : 0));
  const candidates = spotProfiles
    .map((profile, index) => ({ profile, index, score: scoreProfile(profile, normalized), dwell: dwellMinutes(profile, normalized.pace) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: typeof candidates = [];
  let totalDwellMinutes = 0;
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (selected.length >= 2 && totalDwellMinutes + candidate.dwell > availableMinutes) continue;
    selected.push(candidate);
    totalDwellMinutes += candidate.dwell;
  }

  if (selected.length < 2) return { ok: false, error: "当前偏好无法形成至少两个候选点，请增加可用时间或调整节奏。" };
  const spotsById = new Map(scenicSpots.map((spot) => [spot.id, spot]));
  const stops = selected.flatMap(({ profile, dwell }) => {
    const spot = spotsById.get(profile.id);
    if (!spot || spot.id === "zangfo-valley" || spot.verification !== "候选点位") return [];
    return [{ id: spot.id, name: spot.name, subtitle: spot.subtitle, verification: spot.verification, dwellMinutes: dwell, reason: reasonFor(profile, normalized) }];
  });
  if (stops.length !== selected.length) return { ok: false, error: "候选点配置不完整或核验状态异常，已停止生成路线。" };

  const stopIds = stops.map((stop) => stop.id);
  return {
    ok: true,
    plan: {
      title: title ?? makeTitle(normalized),
      summary: `按“${normalized.companion}”与${normalized.interests.map((interest) => `“${interest}”`).join("、")}偏好确定性排序，共 ${stops.length} 个候选点。`,
      input: normalized,
      stops,
      totalDwellMinutes,
      availableMinutes,
      status: "DEMO_ONLY",
      boundaryNotes: [
        "全部站点仍是研究候选点，未经管理方与现场核验。",
        "总停留时长是原型建议，不含路途、排队、开放限制或临时管制。",
        "演示导览不会把这条候选行程升级为正式导航；请以现场标识与管理方公告为准。",
      ],
      legacyGuideHref: `/guide?demo=1&stops=${encodeURIComponent(stopIds.join(","))}`,
    },
  };
}

export function buildPersonalRoute(input: PersonalRouteInput): PersonalRouteBuildResult {
  return build(input);
}

export function buildRecommendedPersonalRoute(id: string): PersonalRouteBuildResult {
  const recommendation = recommendationDefinitions.find((item) => item.id === id);
  if (!recommendation) return { ok: false, error: "未找到这条推荐路线，已停止生成。" };
  return build({ ...recommendation.input, interests: [...recommendation.input.interests] }, recommendation.title);
}

export const PERSONAL_ROUTE_RECOMMENDATIONS = recommendationDefinitions.map((definition) => {
  const result = buildRecommendedPersonalRoute(definition.id);
  if (!result.ok) throw new Error(`invalid_personal_route_recommendation_${definition.id}`);
  return {
    id: definition.id,
    eyebrow: definition.eyebrow,
    title: definition.title,
    detail: result.plan.stops.map((stop) => stop.name).join(" · "),
    meta: `${result.plan.totalDwellMinutes} 分钟候选停留 · ${definition.input.pace}`,
    input: result.plan.input,
  };
});
