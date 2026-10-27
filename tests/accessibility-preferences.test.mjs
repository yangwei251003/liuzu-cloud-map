import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESSIBILITY_PREFERENCES_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  applyAccessibilityPreferences,
  parseAccessibilityPreferences,
  readAccessibilityPreferences,
  writeAccessibilityPreferences,
} from "../src/lib/accessibility-preferences.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test("strictly parses a complete v1 preference record", () => {
  const value = { ...DEFAULT_ACCESSIBILITY_PREFERENCES, fontScale: "large", muted: true };
  assert.deepEqual(parseAccessibilityPreferences(value), value);
  assert.equal(parseAccessibilityPreferences({ ...value, surprise: true }), null);
});

test("fails safely to defaults for malformed persisted data", () => {
  const storage = memoryStorage({ [ACCESSIBILITY_PREFERENCES_KEY]: "{bad" });
  const result = readAccessibilityPreferences(storage);
  assert.deepEqual(result.preferences, DEFAULT_ACCESSIBILITY_PREFERENCES);
  assert.match(result.error, /安全恢复默认值/);
});

test("round trips valid preferences", () => {
  const storage = memoryStorage();
  const expected = { ...DEFAULT_ACCESSIBILITY_PREFERENCES, highContrast: true, reduceMotion: true };
  assert.equal(writeAccessibilityPreferences(expected, storage), true);
  assert.deepEqual(readAccessibilityPreferences(storage).preferences, expected);
});

test("applies explicit root data attributes", () => {
  const root = { dataset: {} };
  applyAccessibilityPreferences({ ...DEFAULT_ACCESSIBILITY_PREFERENCES, fontScale: "largest", simplifiedVisuals: true }, root);
  assert.deepEqual(root.dataset, { fontScale: "largest", highContrast: "false", simplifiedVisuals: "true", muted: "false", reduceMotion: "false" });
});
