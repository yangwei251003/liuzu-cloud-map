import {
  ALL_ROUTE_TRAVERSAL_MODES,
  planDirectedRoute,
  type DirectedRoutePlan,
  type DirectedRoutePreference,
  type DirectedRouteProfile,
} from "./directed-route-engine";
import {
  parseRouteNetwork,
  type RouteNetworkNode,
  type RouteVisitInterest,
} from "./route-network";

export type ScenicItineraryCompanion = "SOLO" | "FRIENDS" | "FAMILY" | "SENIOR";

export type FormalScenicItineraryInput = {
  scenicAreaId: string;
  originNodeId: string;
  exitNodeId: string;
  expectedNetworkRevision: string;
  expectedOperationalVersion: number;
  budgetMinutes: number;
  interests: RouteVisitInterest[];
  companion: ScenicItineraryCompanion;
  maxStops: number;
  profile: DirectedRouteProfile;
  preference: DirectedRoutePreference;
};

export type FormalScenicItineraryStop = {
  nodeId: string;
  poiId: string | null;
  displayName: string;
  dwellMinutes: number;
  matchedInterests: RouteVisitInterest[];
  familyFriendly: boolean;
  restArea: boolean;
  photoSpot: boolean;
  evidenceReference: string;
};

export type FormalScenicItinerary = {
  schemaVersion: 1;
  itineraryFingerprint: string;
  scenicAreaId: string;
  networkRevision: string;
  operationalVersion: number;
  originNodeId: string;
  exitNodeId: string;
  budgetMinutes: number;
  totalDistanceMeters: number;
  totalWalkingMinutes: number;
  totalDwellMinutes: number;
  totalMinutes: number;
  interests: RouteVisitInterest[];
  companion: ScenicItineraryCompanion;
  stops: FormalScenicItineraryStop[];
  segments: DirectedRoutePlan[];
  notices: Array<"PARTIAL_VISIT_METADATA" | "NO_REST_STOP_SELECTED">;
  generatedAt: string;
  expiresAt: string;
};

export type FormalScenicItineraryResult =
  | { ok: true; itinerary: FormalScenicItinerary }
  | {
    ok: false;
    code: "INPUT_INVALID" | "NETWORK_INVALID" | "ITINERARY_ATTRIBUTES_UNAVAILABLE" | "NO_FEASIBLE_ITINERARY";
    message: string;
  };

export type ScenicItineraryIntent = {
  budgetMinutes: number | null;
  pace: DirectedRoutePreference["pace"];
  interests: RouteVisitInterest[];
  companion: ScenicItineraryCompanion;
  needsConfirmation: Array<"DURATION" | "INTERESTS">;
};

const INTERESTS: RouteVisitInterest[] = ["HISTORY", "CULTURE", "NATURE", "PHOTOGRAPHY", "FAMILY", "REST"];
const COMPANIONS: ScenicItineraryCompanion[] = ["SOLO", "FRIENDS", "FAMILY", "SENIOR"];
const PACE_DWELL_FACTOR: Record<DirectedRoutePreference["pace"], number> = {
  RELAXED: 1.15,
  BALANCED: 1,
  ACTIVE: 0.85,
};

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isId(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validInput(input: FormalScenicItineraryInput) {
  return Boolean(
    input
    && isId(input.scenicAreaId)
    && isId(input.originNodeId)
    && isId(input.exitNodeId)
    && typeof input.expectedNetworkRevision === "string"
    && input.expectedNetworkRevision.trim()
    && Number.isSafeInteger(input.expectedOperationalVersion)
    && input.expectedOperationalVersion > 0
    && Number.isSafeInteger(input.budgetMinutes)
    && input.budgetMinutes >= 60
    && input.budgetMinutes <= 480
    && Array.isArray(input.interests)
    && input.interests.length > 0
    && input.interests.length <= INTERESTS.length
    && input.interests.every((interest) => INTERESTS.includes(interest))
    && new Set(input.interests).size === input.interests.length
    && COMPANIONS.includes(input.companion)
    && Number.isSafeInteger(input.maxStops)
    && input.maxStops >= 1
    && input.maxStops <= 8
    && (input.profile.kind === "WALK" || input.profile.kind === "STEP_FREE")
    && ["RELAXED", "BALANCED", "ACTIVE"].includes(input.preference.pace)
    && ["EASY", "MODERATE", "HARD"].includes(input.preference.maximumDifficulty)
    && Array.isArray(input.preference.allowedTraversalModes)
    && input.preference.allowedTraversalModes.length > 0
    && input.preference.allowedTraversalModes.every((mode) => ALL_ROUTE_TRAVERSAL_MODES.includes(mode))
  );
}

function candidateScore(node: RouteNetworkNode, input: FormalScenicItineraryInput) {
  if (!node.visit) return Number.NEGATIVE_INFINITY;
  const matched = node.visit.interestTags.filter((interest) => input.interests.includes(interest));
  let score = node.visit.editorialPriority + matched.length * 45;
  if (input.interests.includes("PHOTOGRAPHY") && node.visit.photoSpot) score += 30;
  if (input.interests.includes("REST") && node.visit.restArea) score += 25;
  if (input.companion === "FAMILY" && node.visit.familyFriendly) score += 35;
  if (input.companion === "SENIOR" && node.visit.restArea) score += 30;
  return score;
}

function adjustedDwell(node: RouteNetworkNode, pace: DirectedRoutePreference["pace"]) {
  return Math.max(5, Math.ceil((node.visit?.dwellMinutes ?? 0) * PACE_DWELL_FACTOR[pace]));
}

type State = {
  key: string;
  mask: number;
  last: number;
  elapsedMinutes: number;
  score: number;
  previousKey: string | null;
};

function segmentKey(fromNodeId: string, toNodeId: string) {
  return `${fromNodeId}\u0000${toNodeId}`;
}

function routeSegment(
  networkValue: unknown,
  operationalStateValue: unknown,
  input: FormalScenicItineraryInput,
  fromNodeId: string,
  toNodeId: string,
  now: Date,
) {
  return planDirectedRoute(networkValue, operationalStateValue, {
    scenicAreaId: input.scenicAreaId,
    fromNodeId,
    toNodeId,
    expectedNetworkRevision: input.expectedNetworkRevision,
    expectedOperationalVersion: input.expectedOperationalVersion,
    profile: input.profile,
    optimization: "FASTEST",
    preference: input.preference,
  }, now);
}

function popcount(value: number) {
  let count = 0;
  for (let current = value; current > 0; current >>>= 1) count += current & 1;
  return count;
}

export function planFormalScenicItinerary(
  networkValue: unknown,
  operationalStateValue: unknown,
  input: FormalScenicItineraryInput,
  now = new Date(),
): FormalScenicItineraryResult {
  if (!validInput(input) || Number.isNaN(now.getTime())) {
    return { ok: false, code: "INPUT_INVALID", message: "个性路线约束不完整或超出允许范围。" };
  }
  const network = parseRouteNetwork(networkValue);
  if (!network || network.scenicAreaId !== input.scenicAreaId || network.revision !== input.expectedNetworkRevision) {
    return { ok: false, code: "NETWORK_INVALID", message: "正式路网版本无效，无法编排个性路线。" };
  }
  const nodeIds = new Set(network.nodes.map((node) => node.id));
  if (!nodeIds.has(input.originNodeId) || !nodeIds.has(input.exitNodeId)) {
    return { ok: false, code: "INPUT_INVALID", message: "入口或出口不属于当前正式路网。" };
  }
  const eligibleNodes = network.nodes.filter((node) => (
    (node.type === "DESTINATION" || node.type === "FACILITY")
    && node.id !== input.originNodeId
    && node.id !== input.exitNodeId
    && node.visit
    && (input.companion !== "FAMILY" || node.visit.familyFriendly)
  ));
  if (eligibleNodes.length === 0) {
    return { ok: false, code: "ITINERARY_ATTRIBUTES_UNAVAILABLE", message: "当前正式节点尚未发布可审核的游览标签与停留时间。" };
  }
  const candidates = eligibleNodes
    .map((node) => ({ node, score: candidateScore(node, input) }))
    .filter(({ score }) => Number.isFinite(score) && score > 0)
    .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id))
    .slice(0, 10);
  if (candidates.length === 0) {
    return { ok: false, code: "NO_FEASIBLE_ITINERARY", message: "没有与已确认兴趣匹配的正式景点。" };
  }

  const segments = new Map<string, DirectedRoutePlan>();
  const getSegment = (fromNodeId: string, toNodeId: string) => {
    const key = segmentKey(fromNodeId, toNodeId);
    if (segments.has(key)) return segments.get(key) ?? null;
    const result = routeSegment(networkValue, operationalStateValue, input, fromNodeId, toNodeId, now);
    const plan = result.ok ? result.plan : null;
    if (plan) segments.set(key, plan);
    return plan;
  };

  const states = new Map<string, State>();
  candidates.forEach(({ node, score }, index) => {
    const first = getSegment(input.originNodeId, node.id);
    if (!first) return;
    const mask = 1 << index;
    const elapsedMinutes = first.estimatedMinutes + adjustedDwell(node, input.preference.pace);
    const key = `${mask}:${index}`;
    states.set(key, { key, mask, last: index, elapsedMinutes, score, previousKey: null });
  });

  for (let size = 1; size < Math.min(input.maxStops, candidates.length); size += 1) {
    const currentStates = [...states.values()].filter((state) => popcount(state.mask) === size);
    currentStates.forEach((state) => {
      candidates.forEach(({ node, score }, index) => {
        if ((state.mask & (1 << index)) !== 0) return;
        const leg = getSegment(candidates[state.last].node.id, node.id);
        if (!leg) return;
        const elapsedMinutes = state.elapsedMinutes + leg.estimatedMinutes + adjustedDwell(node, input.preference.pace);
        const mask = state.mask | (1 << index);
        const key = `${mask}:${index}`;
        const existing = states.get(key);
        if (!existing || elapsedMinutes < existing.elapsedMinutes - 1e-6) {
          states.set(key, {
            key,
            mask,
            last: index,
            elapsedMinutes,
            score: state.score + score,
            previousKey: state.key,
          });
        }
      });
    });
  }

  const feasible = [...states.values()].map((state) => {
    const exitLeg = getSegment(candidates[state.last].node.id, input.exitNodeId);
    return exitLeg ? { state, exitLeg, totalMinutes: state.elapsedMinutes + exitLeg.estimatedMinutes } : null;
  }).filter((value): value is { state: State; exitLeg: DirectedRoutePlan; totalMinutes: number } => (
    value !== null && value.totalMinutes <= input.budgetMinutes + 1e-6
  ));
  feasible.sort((left, right) => (
    right.state.score - left.state.score
    || popcount(right.state.mask) - popcount(left.state.mask)
    || left.totalMinutes - right.totalMinutes
    || left.state.key.localeCompare(right.state.key)
  ));
  const chosen = feasible[0];
  if (!chosen) return { ok: false, code: "NO_FEASIBLE_ITINERARY", message: "当前时间预算内没有可安全完成并到达出口的正式路线。" };

  const chosenIndexes: number[] = [];
  let cursor: State | undefined = chosen.state;
  while (cursor) {
    chosenIndexes.push(cursor.last);
    cursor = cursor.previousKey ? states.get(cursor.previousKey) : undefined;
  }
  chosenIndexes.reverse();
  const chosenNodes = chosenIndexes.map((index) => candidates[index].node);
  const routePlans: DirectedRoutePlan[] = [];
  let fromNodeId = input.originNodeId;
  for (const node of chosenNodes) {
    const leg = getSegment(fromNodeId, node.id);
    if (!leg) return { ok: false, code: "NETWORK_INVALID", message: "路线段在组合过程中失效。" };
    routePlans.push(leg);
    fromNodeId = node.id;
  }
  routePlans.push(chosen.exitLeg);

  const stops: FormalScenicItineraryStop[] = chosenNodes.map((node) => ({
    nodeId: node.id,
    poiId: node.poiId ?? null,
    displayName: node.displayName ?? node.id,
    dwellMinutes: adjustedDwell(node, input.preference.pace),
    matchedInterests: node.visit!.interestTags.filter((interest) => input.interests.includes(interest)),
    familyFriendly: node.visit!.familyFriendly,
    restArea: node.visit!.restArea,
    photoSpot: node.visit!.photoSpot,
    evidenceReference: node.visit!.evidenceReference,
  }));
  const totalWalkingMinutes = routePlans.reduce((sum, plan) => sum + plan.estimatedMinutes, 0);
  const totalDwellMinutes = stops.reduce((sum, stop) => sum + stop.dwellMinutes, 0);
  const totalDistanceMeters = routePlans.reduce((sum, plan) => sum + plan.distanceMeters, 0);
  const notices: FormalScenicItinerary["notices"] = [];
  const visitCandidateCount = network.nodes.filter((node) => node.type === "DESTINATION" || node.type === "FACILITY").length;
  if (eligibleNodes.length < visitCandidateCount) notices.push("PARTIAL_VISIT_METADATA");
  if ((input.preference.pace === "RELAXED" || input.companion === "SENIOR") && !stops.some((stop) => stop.restArea)) {
    notices.push("NO_REST_STOP_SELECTED");
  }
  const generatedAt = now.toISOString();
  const expiresAt = routePlans.map((plan) => plan.expiresAt).sort()[0];
  const fingerprintPayload = {
    networkRevision: input.expectedNetworkRevision,
    operationalVersion: input.expectedOperationalVersion,
    originNodeId: input.originNodeId,
    exitNodeId: input.exitNodeId,
    budgetMinutes: input.budgetMinutes,
    interests: [...input.interests].sort(),
    companion: input.companion,
    pace: input.preference.pace,
    stops: stops.map((stop) => stop.nodeId),
    segments: routePlans.map((plan) => plan.routeFingerprint),
  };
  return {
    ok: true,
    itinerary: {
      schemaVersion: 1,
      itineraryFingerprint: `sip1-${fnv1a(JSON.stringify(fingerprintPayload))}`,
      scenicAreaId: input.scenicAreaId,
      networkRevision: input.expectedNetworkRevision,
      operationalVersion: input.expectedOperationalVersion,
      originNodeId: input.originNodeId,
      exitNodeId: input.exitNodeId,
      budgetMinutes: input.budgetMinutes,
      totalDistanceMeters,
      totalWalkingMinutes,
      totalDwellMinutes,
      totalMinutes: totalWalkingMinutes + totalDwellMinutes,
      interests: [...input.interests],
      companion: input.companion,
      stops,
      segments: routePlans,
      notices,
      generatedAt,
      expiresAt,
    },
  };
}

export function interpretScenicItineraryPrompt(prompt: string): ScenicItineraryIntent | null {
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (!text || text.length > 500) return null;
  const hourMatch = text.match(/(\d+(?:\.5)?)\s*(?:小时|h|hours?)/i);
  const minuteMatch = text.match(/(\d{2,3})\s*(?:分钟|mins?|minutes?)/i);
  const duration = hourMatch ? Math.round(Number(hourMatch[1]) * 60) : minuteMatch ? Number(minuteMatch[1]) : null;
  const budgetMinutes = duration && Number.isFinite(duration) && duration >= 60 && duration <= 480 ? duration : null;
  const interestRules: Array<[RouteVisitInterest, RegExp]> = [
    ["HISTORY", /历史|古迹|遗址|history/i],
    ["CULTURE", /文化|禅|故事|讲解|culture/i],
    ["NATURE", /自然|森林|山水|瀑布|nature/i],
    ["PHOTOGRAPHY", /摄影|拍照|出片|photo/i],
    ["FAMILY", /亲子|儿童|孩子|family/i],
    ["REST", /轻松|休息|少走|慢游|relax/i],
  ];
  const interests = interestRules.filter(([, pattern]) => pattern.test(text)).map(([interest]) => interest);
  const companion: ScenicItineraryCompanion = /亲子|儿童|孩子/.test(text)
    ? "FAMILY"
    : /长辈|老人|老年|父母/.test(text)
      ? "SENIOR"
      : /朋友|好友|同学/.test(text)
        ? "FRIENDS"
        : "SOLO";
  const pace: DirectedRoutePreference["pace"] = /轻松|休息|少走|慢游/.test(text)
    ? "RELAXED"
    : /尽量多|高强度|挑战|暴走/.test(text)
      ? "ACTIVE"
      : "BALANCED";
  const needsConfirmation: ScenicItineraryIntent["needsConfirmation"] = [];
  if (budgetMinutes === null) needsConfirmation.push("DURATION");
  if (interests.length === 0) needsConfirmation.push("INTERESTS");
  return { budgetMinutes, pace, interests, companion, needsConfirmation };
}
