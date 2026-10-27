"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { motionDuration, motionEase, type MotionTier } from "@/lib/motion-system";
import { useMotionPreference } from "@/lib/use-motion-preference";

export function RouteTransition({ children, tier }: { children: ReactNode; tier: MotionTier }) {
  const pathname = usePathname();
  const { reduced } = useMotionPreference();
  const distance = tier === "cinematic" ? 22 : tier === "expressive" ? 14 : 6;
  return (
    <>
      <motion.div
        key={pathname}
        className="route-transition-veil"
        aria-hidden="true"
        initial={reduced ? { opacity: 0.08 } : { opacity: tier === "cinematic" ? 0.42 : 0.22, y: distance }}
        animate={{ opacity: 0, y: 0 }}
        transition={{ duration: reduced ? motionDuration.instant : tier === "cinematic" ? 0.72 : tier === "expressive" ? 0.46 : 0.24, ease: motionEase.enter }}
        suppressHydrationWarning
      />
      {children}
    </>
  );
}
