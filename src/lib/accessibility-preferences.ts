export const ACCESSIBILITY_PREFERENCES_KEY = "liuzu-cloud-tour:accessibility:v1";
export const ACCESSIBILITY_PREFERENCES_EVENT = "liuzu-cloud-tour:accessibility-changed";
export const PROJECT_DATA_CLEARED_EVENT = "liuzu-cloud-tour:data-cleared";

export type FontScale = "default" | "large" | "largest";

export type AccessibilityPreferences = {
  version: 1;
  fontScale: FontScale;
  highContrast: boolean;
  simplifiedVisuals: boolean;
  muted: boolean;
  reduceMotion: boolean;
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  version: 1,
  fontScale: "default",
  highContrast: false,
  simplifiedVisuals: false,
  muted: false,
  reduceMotion: false,
};

const allowedKeys = new Set([
  "version",
  "fontScale",
  "highContrast",
  "simplifiedVisuals",
  "muted",
  "reduceMotion",
]);

export function parseAccessibilityPreferences(value: unknown): AccessibilityPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
  if (
    record.version !== 1 ||
    !["default", "large", "largest"].includes(String(record.fontScale)) ||
    typeof record.highContrast !== "boolean" ||
    typeof record.simplifiedVisuals !== "boolean" ||
    typeof record.muted !== "boolean" ||
    typeof record.reduceMotion !== "boolean"
  ) return null;

  return {
    version: 1,
    fontScale: record.fontScale as FontScale,
    highContrast: record.highContrast,
    simplifiedVisuals: record.simplifiedVisuals,
    muted: record.muted,
    reduceMotion: record.reduceMotion,
  };
}

export function readAccessibilityPreferences(storage: Pick<Storage, "getItem"> | null = null) {
  if (!storage) return { preferences: DEFAULT_ACCESSIBILITY_PREFERENCES, error: null as string | null };
  try {
    const raw = storage.getItem(ACCESSIBILITY_PREFERENCES_KEY);
    if (!raw) return { preferences: DEFAULT_ACCESSIBILITY_PREFERENCES, error: null as string | null };
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { preferences: DEFAULT_ACCESSIBILITY_PREFERENCES, error: "辅助设置已损坏，已安全恢复默认值。" };
    }
    const parsed = parseAccessibilityPreferences(decoded);
    if (!parsed) return { preferences: DEFAULT_ACCESSIBILITY_PREFERENCES, error: "辅助设置已损坏，已安全恢复默认值。" };
    return { preferences: parsed, error: null as string | null };
  } catch {
    return { preferences: DEFAULT_ACCESSIBILITY_PREFERENCES, error: "浏览器阻止读取辅助设置，当前使用默认值。" };
  }
}

export function writeAccessibilityPreferences(
  preferences: AccessibilityPreferences,
  storage: Pick<Storage, "setItem"> | null = null,
) {
  const parsed = parseAccessibilityPreferences(preferences);
  if (!parsed || !storage) return false;
  try {
    storage.setItem(ACCESSIBILITY_PREFERENCES_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function applyAccessibilityPreferences(
  preferences: AccessibilityPreferences,
  root: Pick<HTMLElement, "dataset">,
) {
  root.dataset.fontScale = preferences.fontScale;
  root.dataset.highContrast = preferences.highContrast ? "true" : "false";
  root.dataset.simplifiedVisuals = preferences.simplifiedVisuals ? "true" : "false";
  root.dataset.muted = preferences.muted ? "true" : "false";
  // The former manual reduce-motion switch was retired. Motion now follows the
  // visitor's operating-system preference, so stale v1 storage cannot silently
  // force the whole experience into a static presentation.
  root.dataset.reduceMotion = "false";
}
