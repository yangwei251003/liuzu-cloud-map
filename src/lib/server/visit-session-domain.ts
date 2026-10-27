/**
 * The visit-session contract deliberately carries no coordinates, route
 * geometry, narration text, AI output, or arbitrary metadata. Location is
 * evaluated on the device; this server keeps only coarse lifecycle evidence.
 */

const SCENIC_AREA_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{7,127}$/;
const MAX_EXPECTED_REVISION = 2_147_483_646;
const MAX_CURRENT_REVISION = 2_147_483_647;

const VISIT_SESSION_STATES = [
  "READY",
  "STARTED",
  "PAUSED",
  "REPLANNING",
  "ARRIVED",
  "SKIPPED",
  "COMPLETED",
  "ENDED",
  "INVALIDATED",
  "DELETED",
] as const;

const VISIT_SESSION_ACTIONS = [
  "START",
  "PAUSE",
  "RESUME",
  "RECOVER",
  "SKIP",
  "REPLAN",
  "ARRIVE",
  "END",
  "DELETE",
] as const;

export type VisitSessionState = (typeof VISIT_SESSION_STATES)[number];
export type VisitSessionAction = (typeof VISIT_SESSION_ACTIONS)[number];
export type VisitSessionEventType =
  | "STARTED"
  | "PAUSED"
  | "RESUMED"
  | "RECOVERED"
  | "SKIPPED"
  | "REPLANNED"
  | "ARRIVED"
  | "ENDED"
  | "INVALIDATED";

export type VisitSessionCreateInput = {
  scenicAreaId: string;
  itineraryId: string;
  itineraryRevision: number;
  routePlanSnapshotId: string;
  narrationEnabled: boolean;
  expectedRevision: 0;
};

export type VisitSessionEventInput = {
  action: VisitSessionAction;
  expectedRevision: number;
  replacementRoutePlanSnapshotId: string | null;
};

export type VisitSessionTransition = {
  lifecycleState: VisitSessionState;
  eventType: VisitSessionEventType;
  /** Continuing a session is forbidden until its stored formal route is current. */
  requiresCurrentFormalRoute: boolean;
  /** Recovery only accepts a separately persisted, formal route-plan snapshot. */
  requiresReplacementFormalRoute: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

export function isVisitSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isVisitSessionScenicAreaId(value: unknown): value is string {
  return typeof value === "string" && SCENIC_AREA_ID_PATTERN.test(value);
}

export function isVisitSessionState(value: unknown): value is VisitSessionState {
  return typeof value === "string" && (VISIT_SESSION_STATES as readonly string[]).includes(value);
}

export function isVisitSessionAction(value: unknown): value is VisitSessionAction {
  return typeof value === "string" && (VISIT_SESSION_ACTIONS as readonly string[]).includes(value);
}

export function isVisitSessionRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_EXPECTED_REVISION;
}

/** Current revision is derived from `expected_revision + 1` in migration 003. */
export function isVisitSessionCurrentRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CURRENT_REVISION;
}

export function parseVisitSessionCreateInput(value: unknown): VisitSessionCreateInput | null {
  if (
    !isRecord(value)
    || !exactKeys(value, [
      "expectedRevision",
      "itineraryId",
      "itineraryRevision",
      "narrationEnabled",
      "routePlanSnapshotId",
      "scenicAreaId",
    ])
    || !isVisitSessionScenicAreaId(value.scenicAreaId)
    || !isVisitSessionId(value.itineraryId)
    || !isVisitSessionId(value.routePlanSnapshotId)
    || typeof value.narrationEnabled !== "boolean"
    || !isVisitSessionRevision(value.itineraryRevision)
    || value.itineraryRevision < 1
    || value.expectedRevision !== 0
  ) {
    return null;
  }
  return {
    scenicAreaId: value.scenicAreaId,
    itineraryId: value.itineraryId,
    itineraryRevision: value.itineraryRevision,
    routePlanSnapshotId: value.routePlanSnapshotId,
    narrationEnabled: value.narrationEnabled,
    expectedRevision: 0,
  };
}

export function parseVisitSessionEventInput(value: unknown): VisitSessionEventInput | null {
  if (!isRecord(value) || !isVisitSessionAction(value.action) || !isVisitSessionRevision(value.expectedRevision)) {
    return null;
  }

  if (value.action === "RECOVER") {
    if (!exactKeys(value, ["action", "expectedRevision", "routePlanSnapshotId"]) || !isVisitSessionId(value.routePlanSnapshotId)) {
      return null;
    }
    return {
      action: value.action,
      expectedRevision: value.expectedRevision,
      replacementRoutePlanSnapshotId: value.routePlanSnapshotId,
    };
  }

  if (!exactKeys(value, ["action", "expectedRevision"])) return null;
  return {
    action: value.action,
    expectedRevision: value.expectedRevision,
    replacementRoutePlanSnapshotId: null,
  };
}

export function parseVisitSessionIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

/**
 * State changes are intentionally small and deterministic. A `RECOVER`
 * action can only leave REPLANNING and must be paired with a new, verified
 * formal route-plan snapshot by the repository layer.
 */
export function transitionVisitSession(
  currentState: VisitSessionState,
  action: VisitSessionAction,
): VisitSessionTransition | null {
  if (action === "DELETE" && currentState !== "DELETED") {
    return {
      lifecycleState: "DELETED",
      // 003 has no DELETED event type; INVALIDATED is the permitted coarse
      // audit marker for a user-initiated deletion transition.
      eventType: "INVALIDATED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }

  if (currentState === "READY" && action === "START") {
    return {
      lifecycleState: "STARTED",
      eventType: "STARTED",
      requiresCurrentFormalRoute: true,
      requiresReplacementFormalRoute: false,
    };
  }
  if (currentState === "STARTED" && action === "PAUSE") {
    return {
      lifecycleState: "PAUSED",
      eventType: "PAUSED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }
  if ((currentState === "PAUSED" || currentState === "SKIPPED") && action === "RESUME") {
    return {
      lifecycleState: "STARTED",
      eventType: "RESUMED",
      requiresCurrentFormalRoute: true,
      requiresReplacementFormalRoute: false,
    };
  }
  if (currentState === "REPLANNING" && action === "RECOVER") {
    return {
      lifecycleState: "STARTED",
      eventType: "RECOVERED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: true,
    };
  }
  if (
    (currentState === "STARTED" || currentState === "PAUSED" || currentState === "ARRIVED" || currentState === "SKIPPED")
    && action === "REPLAN"
  ) {
    return {
      lifecycleState: "REPLANNING",
      eventType: "REPLANNED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }
  if (currentState === "STARTED" && action === "ARRIVE") {
    return {
      lifecycleState: "ARRIVED",
      eventType: "ARRIVED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }
  if ((currentState === "STARTED" || currentState === "ARRIVED") && action === "SKIP") {
    return {
      lifecycleState: "SKIPPED",
      eventType: "SKIPPED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }
  if (
    (currentState === "READY"
      || currentState === "STARTED"
      || currentState === "PAUSED"
      || currentState === "REPLANNING"
      || currentState === "ARRIVED"
      || currentState === "SKIPPED")
    && action === "END"
  ) {
    return {
      lifecycleState: currentState === "ARRIVED" ? "COMPLETED" : "ENDED",
      eventType: "ENDED",
      requiresCurrentFormalRoute: false,
      requiresReplacementFormalRoute: false,
    };
  }
  return null;
}
