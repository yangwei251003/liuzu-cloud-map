import assert from "node:assert/strict";
import test from "node:test";
import {
  createFormalNavigationPageLifecycleState,
  formalNavigationPageLifecycleBlocksActivation,
  formalNavigationPageLifecycleLabel,
  transitionFormalNavigationPageLifecycle,
} from "../src/lib/formal-navigation-page-lifecycle.ts";

test("active navigation pauses once and clears only the ephemeral reroute fix", () => {
  const initial = createFormalNavigationPageLifecycleState();
  const hidden = transitionFormalNavigationPageLifecycle(initial, {
    type: "SUSPEND",
    reason: "VISIBILITY_HIDDEN",
    navigationWasActive: true,
  });
  assert.equal(hidden.state.phase, "BACKGROUND");
  assert.equal(hidden.state.suspendedActiveNavigation, true);
  assert.equal(hidden.shouldPauseNavigation, true);
  assert.equal(hidden.shouldClearEphemeralLocation, true);

  const duplicate = transitionFormalNavigationPageLifecycle(hidden.state, {
    type: "SUSPEND",
    reason: "PAGEHIDE",
    navigationWasActive: false,
  });
  assert.equal(duplicate.state, hidden.state);
  assert.equal(duplicate.shouldPauseNavigation, false);
  assert.equal(duplicate.shouldClearEphemeralLocation, false);
});

test("restoring an auto-paused route verifies first and never auto-resumes", () => {
  const hidden = transitionFormalNavigationPageLifecycle(createFormalNavigationPageLifecycleState(), {
    type: "SUSPEND",
    reason: "PAGEHIDE",
    navigationWasActive: true,
  }).state;
  const restoring = transitionFormalNavigationPageLifecycle(hidden, { type: "RESTORE_REQUESTED" });
  assert.equal(restoring.state.phase, "VERIFYING");
  assert.equal(restoring.shouldVerifyRoute, true);
  assert.equal(formalNavigationPageLifecycleBlocksActivation(restoring.state), true);

  const verified = transitionFormalNavigationPageLifecycle(restoring.state, { type: "VERIFY_SUCCEEDED" });
  assert.equal(verified.state.phase, "READY_TO_RESUME");
  assert.equal(verified.state.suspendedActiveNavigation, true);
  assert.equal(formalNavigationPageLifecycleBlocksActivation(verified.state), false);
  assert.match(formalNavigationPageLifecycleLabel(verified.state), /确认恢复/);
});

test("a route paused by the visitor stays manually paused without inventing an auto-resume gate", () => {
  const hidden = transitionFormalNavigationPageLifecycle(createFormalNavigationPageLifecycleState(), {
    type: "SUSPEND",
    reason: "FREEZE",
    navigationWasActive: false,
  }).state;
  const restoring = transitionFormalNavigationPageLifecycle(hidden, { type: "RESTORE_REQUESTED" });
  const verified = transitionFormalNavigationPageLifecycle(restoring.state, { type: "VERIFY_SUCCEEDED" });
  assert.equal(verified.state.phase, "FOREGROUND");
  assert.equal(verified.state.suspendedActiveNavigation, false);
});

test("a failed foreground verification keeps activation blocked", () => {
  const hidden = transitionFormalNavigationPageLifecycle(createFormalNavigationPageLifecycleState(), {
    type: "SUSPEND",
    reason: "VISIBILITY_HIDDEN",
    navigationWasActive: true,
  }).state;
  const restoring = transitionFormalNavigationPageLifecycle(hidden, { type: "RESTORE_REQUESTED" }).state;
  const stopped = transitionFormalNavigationPageLifecycle(restoring, { type: "VERIFY_FAILED" });
  assert.equal(stopped.state.phase, "STOPPED");
  assert.equal(formalNavigationPageLifecycleBlocksActivation(stopped.state), true);
  assert.match(formalNavigationPageLifecycleLabel(stopped.state), /旧指令保持停止/);
});

test("an async activation race is paused even when the page was already backgrounded", () => {
  const background = transitionFormalNavigationPageLifecycle(createFormalNavigationPageLifecycleState(), {
    type: "SUSPEND",
    reason: "PAGEHIDE",
    navigationWasActive: false,
  }).state;
  const raced = transitionFormalNavigationPageLifecycle(background, {
    type: "SUSPEND",
    reason: "FREEZE",
    navigationWasActive: true,
  });
  assert.equal(raced.state.phase, "BACKGROUND");
  assert.equal(raced.state.suspendedActiveNavigation, true);
  assert.equal(raced.shouldPauseNavigation, true);
  assert.equal(raced.shouldClearEphemeralLocation, true);
});
