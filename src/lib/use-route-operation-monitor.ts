"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRouteOperationalMonitorDisabledDecision,
  createRouteOperationalMonitorInitialState,
  evaluateRouteOperationalMonitor,
  parseRouteOperationalMonitorRoute,
  ROUTE_OPERATION_MONITOR_INTERVAL_MS,
  type RouteOperationalMonitorDecision,
  type RouteOperationalMonitorRoute,
  type RouteOperationalMonitorSource,
  type RouteOperationalMonitorState,
  type RouteOperationalMonitorTrigger,
} from "./route-operation-monitor";

/**
 * The caller must adapt this to the authenticated formal snapshot endpoint.
 * Its response is deliberately `unknown` because the core revalidates its
 * exact contract before any instruction can remain active.
 */
export type ReadFormalRouteOperationalSnapshot = (
  route: RouteOperationalMonitorRoute,
) => Promise<unknown>;

export type UseRouteOperationMonitorOptions = {
  enabled: boolean;
  route: unknown;
  readFormalSnapshot: ReadFormalRouteOperationalSnapshot;
  now?: () => Date;
};

export type UseRouteOperationMonitorResult = {
  state: RouteOperationalMonitorState;
  checkNow: () => Promise<RouteOperationalMonitorDecision>;
};

type LastFormalSnapshot = {
  routeId: string;
  snapshot: unknown;
};

const unavailable = (
  transport: "ONLINE" | "OFFLINE",
  code: "FORMAL_NETWORK_UNAVAILABLE" | "NETWORK_REQUEST_FAILED" | "OFFLINE_SNAPSHOT_MISSING",
): RouteOperationalMonitorSource => ({ kind: "UNAVAILABLE", transport, code });

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function readNow(factory: UseRouteOperationMonitorOptions["now"]): Date {
  try {
    const value = factory ? factory() : new Date();
    return value instanceof Date ? value : new Date(Number.NaN);
  } catch {
    return new Date(Number.NaN);
  }
}

/**
 * Monitors a formal route only while a visit session opts in. It polls every
 * 15 seconds and immediately checks again when a page becomes visible or the
 * network returns. The hook is intentionally not wired to a UI: callers must
 * stop rendering/voicing old instructions whenever `instructionState` changes
 * from `ACTIVE`, then execute only the returned deterministic replan request.
 */
export function useRouteOperationMonitor(
  options: UseRouteOperationMonitorOptions,
): UseRouteOperationMonitorResult {
  const optionsRef = useRef(options);
  const lastFormalSnapshotRef = useRef<LastFormalSnapshot | null>(null);
  const sequenceRef = useRef(0);
  const [state, setState] = useState<RouteOperationalMonitorState>(() => createRouteOperationalMonitorInitialState());

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const runCheck = useCallback(async (trigger: RouteOperationalMonitorTrigger): Promise<RouteOperationalMonitorDecision> => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    const current = optionsRef.current;
    const now = readNow(current.now);

    if (!current.enabled) {
      const decision = createRouteOperationalMonitorDisabledDecision(now);
      if (sequence === sequenceRef.current) {
        setState({ isChecking: false, lastTrigger: trigger, lastCheckedAt: decision.checkedAt, decision });
      }
      return decision;
    }

    if (sequence === sequenceRef.current) {
      setState((previous) => ({ ...previous, isChecking: true, lastTrigger: trigger }));
    }

    const parsedRoute = parseRouteOperationalMonitorRoute(current.route);
    let source: RouteOperationalMonitorSource;
    if (!parsedRoute) {
      source = unavailable(browserIsOffline() ? "OFFLINE" : "ONLINE", "FORMAL_NETWORK_UNAVAILABLE");
    } else if (browserIsOffline()) {
      const cached = lastFormalSnapshotRef.current;
      source = cached?.routeId === parsedRoute.routeId
        ? { kind: "FORMAL_SNAPSHOT", transport: "OFFLINE", snapshot: cached.snapshot }
        : unavailable("OFFLINE", "OFFLINE_SNAPSHOT_MISSING");
    } else {
      try {
        source = {
          kind: "FORMAL_SNAPSHOT",
          transport: "ONLINE",
          snapshot: await current.readFormalSnapshot(parsedRoute),
        };
      } catch {
        source = unavailable("ONLINE", "NETWORK_REQUEST_FAILED");
      }
    }

    const decision = evaluateRouteOperationalMonitor({ route: current.route, source }, now);
    if (sequence === sequenceRef.current) {
      if (parsedRoute && decision.snapshot && source.kind === "FORMAL_SNAPSHOT") {
        // Memory only: no service-worker or persistent cache stores operational state.
        lastFormalSnapshotRef.current = { routeId: parsedRoute.routeId, snapshot: source.snapshot };
      }
      setState({ isChecking: false, lastTrigger: trigger, lastCheckedAt: decision.checkedAt, decision });
    }
    return decision;
  }, []);

  const checkNow = useCallback(() => runCheck("MANUAL"), [runCheck]);
  const enabled = options.enabled;
  const routeBinding = parseRouteOperationalMonitorRoute(options.route);
  const routeBindingKey = routeBinding
    ? [
      routeBinding.routeId,
      routeBinding.scenicAreaId,
      routeBinding.networkRevision,
      String(routeBinding.operationalVersion),
      routeBinding.expiresAt,
    ].join("\u0000")
    : "INVALID_ROUTE_BINDING";

  useEffect(() => {
    if (!enabled) {
      void runCheck("MANUAL");
      return () => {
        sequenceRef.current += 1;
      };
    }

    void runCheck("START");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void runCheck("PAGE_VISIBLE");
    };
    const onOnline = () => { void runCheck("NETWORK_ONLINE"); };
    const onOffline = () => { void runCheck("NETWORK_OFFLINE"); };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void runCheck("INTERVAL");
    }, ROUTE_OPERATION_MONITOR_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      sequenceRef.current += 1;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, routeBindingKey, runCheck]);

  return { state, checkNow };
}
