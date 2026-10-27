"use client";

import { useReducedMotion } from "framer-motion";
import { useAccessibilityPreferences } from "./use-accessibility-preferences";

export function useMotionPreference() {
  const systemReduced = Boolean(useReducedMotion());
  const { simplifiedVisuals } = useAccessibilityPreferences();
  return {
    reduced: systemReduced || simplifiedVisuals,
    systemReduced,
    simplifiedVisuals,
  } as const;
}
