export const FOREGROUND_GUIDANCE_MAX_ACCURACY_METERS = 50;
export const FOREGROUND_GUIDANCE_APPROACH_RADIUS_METERS = 80;
export const FOREGROUND_GUIDANCE_STABLE_SAMPLE_COUNT = 3;
export const FOREGROUND_GUIDANCE_DWELL_MS = 10_000;
export const FOREGROUND_GUIDANCE_MAX_SAMPLE_GAP_MS = 15_000;

export type ForegroundGuidanceSessionStatus = "IDLE" | "ACTIVE" | "PAUSED" | "COMPLETED";
export type ForegroundLocationQuality = "reliable" | "low_accuracy" | "invalid";
export type ForegroundApproachStatus = "blocked" | "tracking" | "maybe_near";

export type ForegroundLocationSample = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export type ForegroundGuidanceTarget = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type ForegroundGuidanceGate = {
  userEnabled: boolean;
  demoMode: boolean;
  canStartDemo: boolean;
  sessionStatus: ForegroundGuidanceSessionStatus;
};

export type ForegroundApproachTracker = {
  targetId: string;
  qualifyingSamples: number;
  firstQualifiedAt: number | null;
  lastSampleAt: number | null;
};

export type ForegroundGuidanceEvaluation = {
  quality: ForegroundLocationQuality;
  distanceMeters: number | null;
  roughDirection: string | null;
  approachStatus: ForegroundApproachStatus;
  tracker: ForegroundApproachTracker;
};

function validCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function shouldRunForegroundGuidance(gate: ForegroundGuidanceGate): boolean {
  return gate.userEnabled && gate.demoMode && gate.canStartDemo && gate.sessionStatus === "ACTIVE";
}

export function classifyForegroundLocation(sample: ForegroundLocationSample): ForegroundLocationQuality {
  if (
    !validCoordinate(sample.latitude, sample.longitude) ||
    !Number.isFinite(sample.accuracy) ||
    sample.accuracy < 1 ||
    !Number.isFinite(sample.timestamp) ||
    sample.timestamp < 0
  ) {
    return "invalid";
  }
  return sample.accuracy <= FOREGROUND_GUIDANCE_MAX_ACCURACY_METERS ? "reliable" : "low_accuracy";
}

export function foregroundDistanceMeters(
  origin: Pick<ForegroundLocationSample, "latitude" | "longitude">,
  target: Pick<ForegroundGuidanceTarget, "latitude" | "longitude">,
): number {
  if (!validCoordinate(origin.latitude, origin.longitude) || !validCoordinate(target.latitude, target.longitude)) {
    return Number.NaN;
  }
  const radians = Math.PI / 180;
  const latitudeDelta = (target.latitude - origin.latitude) * radians;
  const longitudeDelta = (target.longitude - origin.longitude) * radians;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(origin.latitude * radians) *
      Math.cos(target.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

export function foregroundRoughDirection(
  origin: Pick<ForegroundLocationSample, "latitude" | "longitude">,
  target: Pick<ForegroundGuidanceTarget, "latitude" | "longitude">,
): string | null {
  const distance = foregroundDistanceMeters(origin, target);
  if (!Number.isFinite(distance)) return null;
  if (distance < 1) return "当前位置附近";

  const radians = Math.PI / 180;
  const longitudeDelta = (target.longitude - origin.longitude) * radians;
  const originLatitude = origin.latitude * radians;
  const targetLatitude = target.latitude * radians;
  const y = Math.sin(longitudeDelta) * Math.cos(targetLatitude);
  const x =
    Math.cos(originLatitude) * Math.sin(targetLatitude) -
    Math.sin(originLatitude) * Math.cos(targetLatitude) * Math.cos(longitudeDelta);
  const bearing = (Math.atan2(y, x) / radians + 360) % 360;
  const labels = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return labels[Math.round(bearing / 45) % labels.length];
}

export function createForegroundApproachTracker(targetId: string): ForegroundApproachTracker {
  return {
    targetId,
    qualifyingSamples: 0,
    firstQualifiedAt: null,
    lastSampleAt: null,
  };
}

export function evaluateForegroundGuidance(input: {
  sample: ForegroundLocationSample;
  target: ForegroundGuidanceTarget;
  gate: ForegroundGuidanceGate;
  previousTracker?: ForegroundApproachTracker | null;
}): ForegroundGuidanceEvaluation {
  const quality = classifyForegroundLocation(input.sample);
  const resetTracker = createForegroundApproachTracker(input.target.id);
  if (quality === "invalid") {
    return { quality, distanceMeters: null, roughDirection: null, approachStatus: "blocked", tracker: resetTracker };
  }

  const distanceMeters = foregroundDistanceMeters(input.sample, input.target);
  if (!Number.isFinite(distanceMeters)) {
    return { quality: "invalid", distanceMeters: null, roughDirection: null, approachStatus: "blocked", tracker: resetTracker };
  }
  if (quality === "low_accuracy") {
    return { quality, distanceMeters: null, roughDirection: null, approachStatus: "blocked", tracker: resetTracker };
  }

  const roughDirection = foregroundRoughDirection(input.sample, input.target);
  if (!shouldRunForegroundGuidance(input.gate)) {
    return { quality, distanceMeters, roughDirection, approachStatus: "blocked", tracker: resetTracker };
  }

  const previous = input.previousTracker?.targetId === input.target.id
    ? input.previousTracker
    : resetTracker;
  const timestampMovesForward = previous.lastSampleAt === null || input.sample.timestamp > previous.lastSampleAt;
  const sampleGapIsStable =
    previous.lastSampleAt === null ||
    input.sample.timestamp - previous.lastSampleAt <= FOREGROUND_GUIDANCE_MAX_SAMPLE_GAP_MS;
  const conservativelyInsideRadius =
    distanceMeters + input.sample.accuracy <= FOREGROUND_GUIDANCE_APPROACH_RADIUS_METERS;

  let tracker: ForegroundApproachTracker;
  if (!conservativelyInsideRadius || !timestampMovesForward || !sampleGapIsStable) {
    tracker = {
      ...resetTracker,
      lastSampleAt: input.sample.timestamp,
    };
  } else {
    tracker = {
      targetId: input.target.id,
      qualifyingSamples: previous.qualifyingSamples + 1,
      firstQualifiedAt: previous.firstQualifiedAt ?? input.sample.timestamp,
      lastSampleAt: input.sample.timestamp,
    };
  }

  const dwellMs = tracker.firstQualifiedAt === null ? 0 : input.sample.timestamp - tracker.firstQualifiedAt;
  const maybeNear =
    tracker.qualifyingSamples >= FOREGROUND_GUIDANCE_STABLE_SAMPLE_COUNT &&
    dwellMs >= FOREGROUND_GUIDANCE_DWELL_MS;
  return {
    quality,
    distanceMeters,
    roughDirection,
    approachStatus: maybeNear ? "maybe_near" : "tracking",
    tracker,
  };
}

export function formatForegroundDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return "距离不可用";
  if (distanceMeters < 10) return "约 10 米内";
  if (distanceMeters < 1_000) return `约 ${Math.round(distanceMeters / 10) * 10} 米`;
  return `约 ${(distanceMeters / 1_000).toFixed(1)} 公里`;
}

export function buildForegroundDistanceAnnouncement(input: {
  targetName: string;
  distanceMeters: number;
  roughDirection: string;
}): string {
  const direction = input.roughDirection === "当前位置附近"
    ? "目标与当前位置大致重合"
    : `目标大致位于${input.roughDirection}侧`;
  return `到下一打卡候选点“${input.targetName}”的直线距离${formatForegroundDistance(input.distanceMeters)}，${direction}。此为候选点方位参考，仍需查看现场标识并手动确认到达。`;
}
