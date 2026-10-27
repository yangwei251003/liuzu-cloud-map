import assert from "node:assert/strict";
import test from "node:test";
import {
  decideGeolocationPermissionTransition,
  geolocationPermissionBlocksActivation,
  normalizeGeolocationPermissionState,
} from "../src/lib/geolocation-session-policy.ts";

test("browser permission states normalize to the closed UI contract", () => {
  assert.equal(normalizeGeolocationPermissionState("granted"), "GRANTED");
  assert.equal(normalizeGeolocationPermissionState("prompt"), "PROMPT");
  assert.equal(normalizeGeolocationPermissionState("denied"), "DENIED");
});

test("revoking permission suspends an active session and clears ephemeral position", () => {
  const decision = decideGeolocationPermissionTransition({
    previousState: "GRANTED",
    browserState: "denied",
    sessionActive: true,
    hasCommittedRoute: true,
    foreground: true,
    automaticLocateConsumed: true,
  });
  assert.deepEqual(decision, {
    state: "DENIED",
    shouldSuspendActiveSession: true,
    shouldClearEphemeralPosition: true,
    shouldInvalidatePendingRequest: true,
    shouldAutomaticallyLocate: false,
  });
  assert.equal(geolocationPermissionBlocksActivation(decision.state), true);
});

test("returning to prompt also stops an active session but remains explicitly recoverable", () => {
  const decision = decideGeolocationPermissionTransition({
    previousState: "GRANTED",
    browserState: "prompt",
    sessionActive: true,
    hasCommittedRoute: true,
    foreground: true,
    automaticLocateConsumed: true,
  });
  assert.equal(decision.shouldSuspendActiveSession, true);
  assert.equal(decision.shouldClearEphemeralPosition, true);
  assert.equal(geolocationPermissionBlocksActivation(decision.state), false);
});

test("granting permission never auto-locates over a committed route or in background", () => {
  const withRoute = decideGeolocationPermissionTransition({
    previousState: "DENIED",
    browserState: "granted",
    sessionActive: false,
    hasCommittedRoute: true,
    foreground: true,
    automaticLocateConsumed: false,
  });
  assert.equal(withRoute.shouldAutomaticallyLocate, false);

  const background = decideGeolocationPermissionTransition({
    previousState: "PROMPT",
    browserState: "granted",
    sessionActive: false,
    hasCommittedRoute: false,
    foreground: false,
    automaticLocateConsumed: false,
  });
  assert.equal(background.shouldAutomaticallyLocate, false);
});

test("an initial foreground grant auto-locates only once when no route exists", () => {
  const first = decideGeolocationPermissionTransition({
    previousState: "CHECKING",
    browserState: "granted",
    sessionActive: false,
    hasCommittedRoute: false,
    foreground: true,
    automaticLocateConsumed: false,
  });
  assert.equal(first.shouldAutomaticallyLocate, true);

  const repeated = decideGeolocationPermissionTransition({
    previousState: "GRANTED",
    browserState: "granted",
    sessionActive: false,
    hasCommittedRoute: false,
    foreground: true,
    automaticLocateConsumed: true,
  });
  assert.equal(repeated.shouldAutomaticallyLocate, false);
});
