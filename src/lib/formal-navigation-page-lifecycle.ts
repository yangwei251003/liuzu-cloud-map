export type FormalNavigationPageLifecyclePhase =
  | "FOREGROUND"
  | "BACKGROUND"
  | "VERIFYING"
  | "READY_TO_RESUME"
  | "STOPPED";

export type FormalNavigationPageSuspendReason =
  | "VISIBILITY_HIDDEN"
  | "PAGEHIDE"
  | "FREEZE";

export type FormalNavigationPageLifecycleState = {
  phase: FormalNavigationPageLifecyclePhase;
  suspendedActiveNavigation: boolean;
  suspendReason: FormalNavigationPageSuspendReason | null;
};

export type FormalNavigationPageLifecycleEvent =
  | {
    type: "SUSPEND";
    reason: FormalNavigationPageSuspendReason;
    navigationWasActive: boolean;
  }
  | { type: "RESTORE_REQUESTED" }
  | { type: "VERIFY_SUCCEEDED" }
  | { type: "VERIFY_FAILED" }
  | { type: "NAVIGATION_ACTIVE" }
  | { type: "RESET" };

export type FormalNavigationPageLifecycleDecision = {
  state: FormalNavigationPageLifecycleState;
  shouldPauseNavigation: boolean;
  shouldClearEphemeralLocation: boolean;
  shouldVerifyRoute: boolean;
};

export function createFormalNavigationPageLifecycleState(): FormalNavigationPageLifecycleState {
  return {
    phase: "FOREGROUND",
    suspendedActiveNavigation: false,
    suspendReason: null,
  };
}

function decision(
  state: FormalNavigationPageLifecycleState,
  effects: Partial<Omit<FormalNavigationPageLifecycleDecision, "state">> = {},
): FormalNavigationPageLifecycleDecision {
  return {
    state,
    shouldPauseNavigation: effects.shouldPauseNavigation ?? false,
    shouldClearEphemeralLocation: effects.shouldClearEphemeralLocation ?? false,
    shouldVerifyRoute: effects.shouldVerifyRoute ?? false,
  };
}

/**
 * Models only page lifecycle safety. GPS fixes, route geometry and timestamps
 * remain outside this state so the result is safe to render and impossible to
 * turn into a location history by persistence.
 */
export function transitionFormalNavigationPageLifecycle(
  current: FormalNavigationPageLifecycleState,
  event: FormalNavigationPageLifecycleEvent,
): FormalNavigationPageLifecycleDecision {
  if (event.type === "RESET") return decision(createFormalNavigationPageLifecycleState());
  if (event.type === "NAVIGATION_ACTIVE") return decision(createFormalNavigationPageLifecycleState());

  if (event.type === "SUSPEND") {
    if (current.phase === "BACKGROUND" && !event.navigationWasActive) return decision(current);
    return decision({
      phase: "BACKGROUND",
      suspendedActiveNavigation: current.suspendedActiveNavigation || event.navigationWasActive,
      suspendReason: event.reason,
    }, {
      // If an async start/replan raced with a previous pagehide, the runtime may
      // have become active while the lifecycle was already BACKGROUND. Pause it
      // again; callers synchronously update their runtime ref, so duplicate
      // browser events do not produce duplicate pause actions.
      shouldPauseNavigation: event.navigationWasActive,
      shouldClearEphemeralLocation: event.navigationWasActive,
    });
  }

  if (event.type === "RESTORE_REQUESTED") {
    if (current.phase !== "BACKGROUND") return decision(current);
    return decision({ ...current, phase: "VERIFYING" }, { shouldVerifyRoute: true });
  }

  if (event.type === "VERIFY_SUCCEEDED") {
    if (current.phase !== "VERIFYING") return decision(current);
    return decision({
      phase: current.suspendedActiveNavigation ? "READY_TO_RESUME" : "FOREGROUND",
      suspendedActiveNavigation: current.suspendedActiveNavigation,
      suspendReason: current.suspendedActiveNavigation ? current.suspendReason : null,
    });
  }

  if (event.type === "VERIFY_FAILED") {
    if (current.phase !== "VERIFYING") return decision(current);
    return decision({ ...current, phase: "STOPPED" });
  }

  return decision(current);
}

export function formalNavigationPageLifecycleBlocksActivation(
  state: FormalNavigationPageLifecycleState,
): boolean {
  return state.phase === "BACKGROUND" || state.phase === "VERIFYING" || state.phase === "STOPPED";
}

export function formalNavigationPageLifecycleLabel(
  state: FormalNavigationPageLifecycleState,
): string {
  if (state.phase === "BACKGROUND") return "页面已转入后台，导航保持暂停";
  if (state.phase === "VERIFYING") return "正在重新核验正式路线与运营状态";
  if (state.phase === "READY_TO_RESUME") return "前台状态已核验，请确认恢复导航";
  if (state.phase === "STOPPED") return "前台复核未通过，旧指令保持停止";
  return "页面位于前台";
}
