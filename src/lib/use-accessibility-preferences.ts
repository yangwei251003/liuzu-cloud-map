"use client";

import { useEffect, useState } from "react";
import {
  ACCESSIBILITY_PREFERENCES_EVENT,
  ACCESSIBILITY_PREFERENCES_KEY,
  type AccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  PROJECT_DATA_CLEARED_EVENT,
  parseAccessibilityPreferences,
  readAccessibilityPreferences,
} from "./accessibility-preferences";

export function useAccessibilityPreferences(): AccessibilityPreferences {
  const [preferences, setPreferences] = useState(DEFAULT_ACCESSIBILITY_PREFERENCES);

  useEffect(() => {
    const readPersisted = () => setPreferences(readAccessibilityPreferences(window.localStorage).preferences);
    const initialTimer = window.setTimeout(readPersisted, 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCESSIBILITY_PREFERENCES_KEY && event.key !== null) return;
      readPersisted();
    };
    const onChanged = (event: Event) => {
      const direct = parseAccessibilityPreferences((event as CustomEvent<unknown>).detail);
      if (direct) setPreferences(direct);
      else readPersisted();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACCESSIBILITY_PREFERENCES_EVENT, onChanged);
    window.addEventListener(PROJECT_DATA_CLEARED_EVENT, readPersisted);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACCESSIBILITY_PREFERENCES_EVENT, onChanged);
      window.removeEventListener(PROJECT_DATA_CLEARED_EVENT, readPersisted);
    };
  }, []);

  return preferences;
}
