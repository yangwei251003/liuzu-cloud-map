export type GeolocationPermissionState = "CHECKING" | "GRANTED" | "PROMPT" | "DENIED" | "UNAVAILABLE";

export type BrowserGeolocationPermissionState = "granted" | "prompt" | "denied";

export type GeolocationPermissionTransitionInput = {
  previousState: GeolocationPermissionState;
  browserState: BrowserGeolocationPermissionState;
  sessionActive: boolean;
  hasCommittedRoute: boolean;
  foreground: boolean;
  automaticLocateConsumed: boolean;
};

export type GeolocationPermissionTransitionDecision = {
  state: Exclude<GeolocationPermissionState, "CHECKING" | "UNAVAILABLE">;
  shouldSuspendActiveSession: boolean;
  shouldClearEphemeralPosition: boolean;
  shouldInvalidatePendingRequest: boolean;
  shouldAutomaticallyLocate: boolean;
};

export function normalizeGeolocationPermissionState(
  state: BrowserGeolocationPermissionState,
): GeolocationPermissionTransitionDecision["state"] {
  if (state === "granted") return "GRANTED";
  if (state === "denied") return "DENIED";
  return "PROMPT";
}

export function decideGeolocationPermissionTransition(
  input: GeolocationPermissionTransitionInput,
): GeolocationPermissionTransitionDecision {
  const state = normalizeGeolocationPermissionState(input.browserState);
  const permissionUnavailable = state !== "GRANTED";
  const permissionWasUsable = input.previousState === "GRANTED" || input.sessionActive;

  return {
    state,
    shouldSuspendActiveSession: input.sessionActive && permissionUnavailable,
    shouldClearEphemeralPosition: permissionUnavailable && permissionWasUsable,
    shouldInvalidatePendingRequest: permissionUnavailable,
    shouldAutomaticallyLocate: state === "GRANTED"
      && input.foreground
      && !input.sessionActive
      && !input.hasCommittedRoute
      && !input.automaticLocateConsumed,
  };
}

export function geolocationPermissionBlocksActivation(state: GeolocationPermissionState) {
  return state === "DENIED";
}
