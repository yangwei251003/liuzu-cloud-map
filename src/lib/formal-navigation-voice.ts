import type { DirectedRoutePlan } from "./directed-route-engine";
import type {
  FormalNavigationRouteMatch,
  FormalNavigationRuntime,
} from "./formal-navigation-runtime";

export const FORMAL_NAVIGATION_VOICE_REPEAT_MIN_INTERVAL_MS = 8_000;

export type FormalNavigationVoiceCategory = "MANEUVER" | "SAFETY" | "ARRIVAL";

export type FormalNavigationVoiceAction =
  | { type: "NONE" }
  | { type: "CANCEL"; reason: string }
  | {
    type: "SPEAK";
    key: string;
    category: FormalNavigationVoiceCategory;
    text: string;
  };

/** Ephemeral speech deduplication state. Callers must never persist it. */
export type FormalNavigationVoiceTracker = {
  gateKey: string | null;
  maneuverIdentity: string | null;
  nearestDistanceBand: number | null;
  lastAnnouncementKey: string | null;
  lastSpokenAtMs: number | null;
};

export type FormalNavigationVoiceInput = {
  enabled: boolean;
  globallyMuted: boolean;
  foreground: boolean;
  runtime: FormalNavigationRuntime | null;
  routeLegKey: string | null;
  nowMs: number;
};

export type FormalNavigationVoiceDecision = {
  tracker: FormalNavigationVoiceTracker;
  action: FormalNavigationVoiceAction;
};

export function createFormalNavigationVoiceTracker(): FormalNavigationVoiceTracker {
  return {
    gateKey: null,
    maneuverIdentity: null,
    nearestDistanceBand: null,
    lastAnnouncementKey: null,
    lastSpokenAtMs: null,
  };
}

function blockedDecision(
  tracker: FormalNavigationVoiceTracker,
  gateKey: string,
  reason: string,
): FormalNavigationVoiceDecision {
  const shouldCancel = tracker.gateKey === "SPEAKABLE"
    || tracker.maneuverIdentity !== null
    || tracker.lastAnnouncementKey !== null;
  return {
    tracker: {
      ...createFormalNavigationVoiceTracker(),
      gateKey,
      lastSpokenAtMs: tracker.lastSpokenAtMs,
    },
    action: shouldCancel ? { type: "CANCEL", reason } : { type: "NONE" },
  };
}

function normalizedSpeechText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 180 ? normalized : null;
}

/**
 * Smaller values are closer to the maneuver. A closer band may be announced
 * once; GNSS jitter back into a farther band cannot replay an old instruction.
 */
function distanceBand(distanceMeters: number) {
  if (distanceMeters <= 15) return 0;
  if (distanceMeters <= 35) return 1;
  if (distanceMeters <= 75) return 2;
  if (distanceMeters <= 150) return 3;
  if (distanceMeters <= 300) return 4;
  return 5;
}

function safetyAnnouncement(runtime: FormalNavigationRuntime): {
  key: string;
  category: Exclude<FormalNavigationVoiceCategory, "MANEUVER">;
  text: string;
} | null {
  if (runtime.status === "COMPLETED" || runtime.guidanceQuality === "ARRIVED") {
    return {
      key: `${runtime.routeFingerprint}:ARRIVAL`,
      category: "ARRIVAL",
      text: "已接近目的地，请核对现场标识后确认到达。",
    };
  }
  if (runtime.status === "REROUTE_REQUIRED") {
    const offRoute = runtime.guidanceQuality === "OFF_ROUTE";
    return {
      key: `${runtime.routeFingerprint}:REROUTE_REQUIRED:${offRoute ? "OFF_ROUTE" : "VERSION"}`,
      category: "SAFETY",
      text: offRoute
        ? "已确认偏航，旧路线指令已停止。请等待安全重算，并核对现场标识。"
        : "路线或运营状态已变化，旧路线指令已停止。请等待安全重算。",
    };
  }
  if (runtime.status !== "ACTIVE") return null;
  if (runtime.guidanceQuality === "WRONG_WAY") {
    return {
      key: `${runtime.routeFingerprint}:WRONG_WAY`,
      category: "SAFETY",
      text: "已确认反向行走，请在安全位置掉头并返回当前路线。",
    };
  }
  const degradedText = runtime.guidanceQuality === "LOW_ACCURACY"
    ? "定位精度不足，语音导航已暂停。请查看屏幕并核对现场标识。"
    : runtime.guidanceQuality === "JUMP"
      ? "检测到定位跳点，语音导航已暂停。请等待位置稳定。"
      : runtime.guidanceQuality === "STALE"
        ? "定位或路线已过期，语音导航已暂停。"
        : runtime.guidanceQuality === "INVALID"
          ? "定位当前不可用，语音导航已暂停。"
          : runtime.guidanceQuality === "OFF_ROUTE"
            ? "路线匹配不可靠，旧语音指令已停止。请核对现场标识。"
            : null;
  return degradedText
    ? {
      key: `${runtime.routeFingerprint}:DEGRADED:${runtime.guidanceQuality}`,
      category: "SAFETY",
      text: degradedText,
    }
    : null;
}

export function decideFormalNavigationVoice(
  tracker: FormalNavigationVoiceTracker,
  input: FormalNavigationVoiceInput,
): FormalNavigationVoiceDecision {
  if (!input.enabled) return blockedDecision(tracker, "DISABLED", "语音未开启");
  if (input.globallyMuted) return blockedDecision(tracker, "GLOBAL_MUTED", "全局静音已开启");
  if (!input.foreground) return blockedDecision(tracker, "BACKGROUND", "页面不在前台");
  if (!input.runtime) return blockedDecision(tracker, "NO_RUNTIME", "没有活动导航");

  const warning = safetyAnnouncement(input.runtime);
  if (warning) {
    if (tracker.lastAnnouncementKey === warning.key) {
      return { tracker: { ...tracker, gateKey: "SPEAKABLE" }, action: { type: "NONE" } };
    }
    return {
      tracker: {
        gateKey: "SPEAKABLE",
        maneuverIdentity: null,
        nearestDistanceBand: null,
        lastAnnouncementKey: warning.key,
        lastSpokenAtMs: input.nowMs,
      },
      action: { type: "SPEAK", ...warning },
    };
  }

  const runtime = input.runtime;
  if (
    runtime.status !== "ACTIVE"
    || runtime.guidanceQuality !== "RELIABLE"
    || !runtime.maneuver
    || !input.routeLegKey
  ) {
    return blockedDecision(
      tracker,
      `${runtime.status}:${runtime.guidanceQuality}`,
      "当前没有可靠的前台逐向指令",
    );
  }

  const text = normalizedSpeechText(runtime.maneuver.instruction);
  if (!text) return blockedDecision(tracker, "INVALID_INSTRUCTION", "语音文本无效");
  const maneuverIdentity = [
    runtime.routeFingerprint,
    input.routeLegKey,
    runtime.maneuver.kind,
  ].join(":");
  const band = distanceBand(Math.max(0, runtime.maneuver.distanceToManeuverMeters));
  const newManeuver = tracker.maneuverIdentity !== maneuverIdentity;
  const closerBand = tracker.nearestDistanceBand === null || band < tracker.nearestDistanceBand;
  const intervalElapsed = tracker.lastSpokenAtMs === null
    || input.nowMs - tracker.lastSpokenAtMs >= FORMAL_NAVIGATION_VOICE_REPEAT_MIN_INTERVAL_MS;
  if (!newManeuver && (!closerBand || !intervalElapsed)) {
    return { tracker: { ...tracker, gateKey: "SPEAKABLE" }, action: { type: "NONE" } };
  }

  const key = `${maneuverIdentity}:DISTANCE_BAND_${band}`;
  return {
    tracker: {
      gateKey: "SPEAKABLE",
      maneuverIdentity,
      nearestDistanceBand: band,
      lastAnnouncementKey: key,
      lastSpokenAtMs: input.nowMs,
    },
    action: { type: "SPEAK", key, category: "MANEUVER", text },
  };
}

/** Returns a stable formal edge identity even when an edge contains curve-shaping points. */
export function formalNavigationVoiceLegKey(
  plan: DirectedRoutePlan | null,
  match: FormalNavigationRouteMatch | null,
) {
  if (
    !plan
    || !match
    || !Number.isSafeInteger(match.segmentIndex)
    || match.segmentIndex < 0
    || !Number.isFinite(match.segmentFraction)
    || match.segmentFraction < 0
    || match.segmentFraction > 1
  ) return null;
  const routeSegmentCount = plan.geometry.coordinates.length - 1;
  const edgeTraversals = plan.traversals.filter((traversal) => traversal.kind === "EDGE");
  const traversalSegmentCounts = edgeTraversals.map((traversal) => traversal.geometry.coordinates.length - 1);
  if (
    routeSegmentCount <= 0
    || match.segmentIndex >= routeSegmentCount
    || traversalSegmentCounts.some((count) => count <= 0)
    || traversalSegmentCounts.reduce((total, count) => total + count, 0) !== routeSegmentCount
  ) return null;
  let firstSegmentIndex = 0;
  for (const traversal of edgeTraversals) {
    const segmentCount = traversal.geometry.coordinates.length - 1;
    const afterLastSegmentIndex = firstSegmentIndex + segmentCount;
    if (match.segmentIndex < afterLastSegmentIndex) {
      return match.segmentIndex >= firstSegmentIndex ? traversal.edgeId : null;
    }
    firstSegmentIndex = afterLastSegmentIndex;
  }
  return null;
}
