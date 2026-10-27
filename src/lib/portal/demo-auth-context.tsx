"use client";

import React, { createContext, useContext, useState, useSyncExternalStore, ReactNode } from "react";
import { PortalRole, PortalUser } from "./types";
import { DEMO_USERS } from "./demo-seed-data";
import { PortalDemoRepository } from "./demo-repository";

const AUTH_STORAGE_KEY = "yunmap-portal:current-role";

interface PortalAuthContextType {
  role: PortalRole;
  user: PortalUser;
  switchRole: (newRole: PortalRole) => void;
  isReady: boolean;
}

const PortalAuthContext = createContext<PortalAuthContextType>({
  role: "visitor",
  user: DEMO_USERS.visitor,
  switchRole: () => {},
  isReady: false,
});

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const [role, setRole] = useState<PortalRole>(() => {
    if (typeof window === "undefined") return "visitor";
    try {
      PortalDemoRepository.initializeIfEmpty();
      const saved = localStorage.getItem(AUTH_STORAGE_KEY) as PortalRole | null;
      if (saved && (saved === "visitor" || saved === "partner" || saved === "studio")) {
        return saved;
      }
    } catch {
      // ignore
    }
    return "visitor";
  });

  const switchRole = (newRole: PortalRole) => {
    setRole(newRole);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, newRole);
    } catch {
      // ignore
    }
  };

  const user = DEMO_USERS[role] || DEMO_USERS.visitor;

  if (!hydrated) return <p role="status" className="p-4">正在读取本机演示数据…</p>;

  return (
    <PortalAuthContext.Provider value={{ role, user, switchRole, isReady: true }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  return useContext(PortalAuthContext);
}
