"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectedRoutePlan } from "./directed-route-engine";
import {
  createRemoteNavigationSession,
  navigationRouteBinding,
  sendRemoteNavigationEvent,
  type RemoteNavigationResult,
  type RemoteNavigationSession,
} from "./navigation-session-client";

export type NavigationHistorySyncState =
  | "IDLE"
  | "SAVING"
  | "SYNCED"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE"
  | "CONFLICT";

type PauseReason = "USER_PAUSED" | "PAGE_HIDDEN" | "SENSOR_UNAVAILABLE";
type RerouteReason = "OFF_ROUTE" | "NETWORK_VERSION_CHANGED" | "OPERATIONAL_STATE_UNAVAILABLE";

function coarseDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.ceil(distanceMeters / 50) * 50;
}

export function useNavigationSessionSync() {
  const [state, setState] = useState<NavigationHistorySyncState>("IDLE");
  const stateRef = useRef<NavigationHistorySyncState>("IDLE");
  const mountedRef = useRef(true);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef<RemoteNavigationSession | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const updateState = useCallback((next: NavigationHistorySyncState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const acceptResult = useCallback((result: RemoteNavigationResult) => {
    if (result.state === "SYNCED") {
      sessionRef.current = result.session;
      updateState("SYNCED");
      return result.session;
    }
    sessionRef.current = null;
    updateState(result.state);
    return null;
  }, [updateState]);

  const enqueue = useCallback((task: () => Promise<void>) => {
    updateState("SAVING");
    queueRef.current = queueRef.current.then(task).catch(() => {
      sessionRef.current = null;
      updateState("UNAVAILABLE");
    });
  }, [updateState]);

  const startOrResume = useCallback((plan: DirectedRoutePlan, remainingDistanceMeters: number) => {
    enqueue(async () => {
      let session = sessionRef.current;
      if (session?.status === "REROUTE_REQUIRED") {
        acceptResult(await sendRemoteNavigationEvent(session, {
          action: "REROUTED",
          remainingDistanceMeters: coarseDistance(remainingDistanceMeters),
          reasonCode: "ROUTE_REPLACED",
          route: navigationRouteBinding(plan),
        }));
        return;
      }
      if (session && session.routeFingerprint !== plan.routeFingerprint) {
        if (!["COMPLETED", "CANCELLED", "EXPIRED"].includes(session.status)) {
          session = acceptResult(await sendRemoteNavigationEvent(session, {
            action: "CANCEL",
            remainingDistanceMeters: session.remainingDistanceBucketMeters,
            reasonCode: "USER_EXIT",
          }));
          if (!session) return;
        }
        sessionRef.current = null;
        session = null;
      }
      if (!session || ["COMPLETED", "CANCELLED", "EXPIRED"].includes(session.status)) {
        session = acceptResult(await createRemoteNavigationSession(plan));
        if (!session) return;
      }
      const action = session.status === "READY" ? "START" : session.status === "PAUSED" ? "RESUME" : null;
      if (!action) {
        updateState("SYNCED");
        return;
      }
      acceptResult(await sendRemoteNavigationEvent(session, {
        action,
        remainingDistanceMeters: coarseDistance(remainingDistanceMeters),
      }));
    });
  }, [acceptResult, enqueue, updateState]);

  const sendEvent = useCallback((body: Record<string, unknown>) => {
    enqueue(async () => {
      const session = sessionRef.current;
      if (!session) {
        const currentState = stateRef.current;
        updateState(currentState === "AUTH_REQUIRED" || currentState === "UNAVAILABLE" || currentState === "CONFLICT" ? currentState : "IDLE");
        return;
      }
      acceptResult(await sendRemoteNavigationEvent(session, body));
    });
  }, [acceptResult, enqueue, updateState]);

  const pause = useCallback((remainingDistanceMeters: number, reasonCode: PauseReason) => {
    sendEvent({ action: "PAUSE", remainingDistanceMeters: coarseDistance(remainingDistanceMeters), reasonCode });
  }, [sendEvent]);

  const requireReroute = useCallback((remainingDistanceMeters: number, reasonCode: RerouteReason) => {
    sendEvent({ action: "REROUTE_REQUIRED", remainingDistanceMeters: coarseDistance(remainingDistanceMeters), reasonCode });
  }, [sendEvent]);

  const arrive = useCallback(() => {
    sendEvent({ action: "ARRIVE", remainingDistanceMeters: 0, reasonCode: "ARRIVAL_CONFIRMED" });
  }, [sendEvent]);

  const cancel = useCallback((remainingDistanceMeters: number) => {
    sendEvent({ action: "CANCEL", remainingDistanceMeters: coarseDistance(remainingDistanceMeters), reasonCode: "USER_EXIT" });
  }, [sendEvent]);

  return { state, startOrResume, pause, requireReroute, arrive, cancel };
}
