"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "@/app/experience-v3.css";
import { ChanxiaoliAssistant } from "./ChanxiaoliAssistant";
import { MobileTaskNav } from "./MobileTaskNav";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { RouteTransition } from "./motion/RouteTransition";
import { tierForPath } from "@/lib/motion-system";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const motionTier = tierForPath(pathname);

  return (
    <div
      className={isHome ? "home-surface" : "app-surface"}
      data-app-route={pathname}
      data-experience={isHome ? undefined : "v3"}
      data-motion-tier={motionTier}
    >
      <MobileTaskNav />
      <RouteTransition tier={motionTier}>{children}</RouteTransition>
      <PwaInstallPrompt />
      {pathname !== "/navigation-lab" ? <ChanxiaoliAssistant /> : null}
    </div>
  );
}
