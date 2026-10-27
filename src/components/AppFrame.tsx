"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "@/app/experience-v3.css";
import { ChanxiaoliAssistant } from "./ChanxiaoliAssistant";
import { MobileTaskNav } from "./MobileTaskNav";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { RouteTransition } from "./motion/RouteTransition";
import { tierForPath } from "@/lib/motion-system";

import { PortalAuthProvider } from "@/lib/portal/demo-auth-context";
import { JudgeDemoToolbar } from "./portal/JudgeDemoToolbar";
import "@/app/portal-tokens.css";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isPortalRoute = pathname.startsWith("/studio") || pathname.startsWith("/partner") || pathname.startsWith("/judge");
  const motionTier = tierForPath(pathname);

  return (
    <PortalAuthProvider>
      <div
        className={isHome ? "home-surface" : "app-surface"}
        data-app-route={pathname}
        data-experience={isHome ? undefined : "v3"}
        data-motion-tier={motionTier}
      >
        <JudgeDemoToolbar />
        {!isPortalRoute ? <MobileTaskNav /> : null}
        <RouteTransition tier={motionTier}>{children}</RouteTransition>
        {!isPortalRoute ? <PwaInstallPrompt /> : null}
        {!isPortalRoute && pathname !== "/navigation-lab" ? <ChanxiaoliAssistant /> : null}
      </div>
    </PortalAuthProvider>
  );
}

