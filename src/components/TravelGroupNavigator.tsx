"use client";

import { Copy, Crosshair, LinkSimple, MapPin, SpinnerGap, UsersThree } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseFreshGroupLocationUpdate,
  relativeGroupMemberLocation,
  type GroupLocationUpdate,
  type GroupMemberLocation,
} from "@/lib/group-location-sharing";
import { normalizeGeolocationPermissionState } from "@/lib/geolocation-session-policy";
import {
  publishTravelGroupMapMembers,
  type TravelGroupMapMember,
} from "@/lib/travel-group-map-events";

export type { TravelGroupMapMember } from "@/lib/travel-group-map-events";

type TravelGroupNavigatorProps = {
  onMembersChange?: (members: TravelGroupMapMember[]) => void;
};

function randomIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function apiMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function readInviteToken() {
  const match = window.location.hash.match(/^#team-invite=([A-Za-z0-9_-]{40,100})$/);
  return match?.[1] ?? null;
}

function parseMembers(value: unknown): GroupMemberLocation[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { members?: unknown }).members)) return null;
  const members = (value as { members: unknown[] }).members;
  const parsed: GroupMemberLocation[] = [];
  for (const member of members) {
    if (!member || typeof member !== "object") return null;
    const record = member as Record<string, unknown>;
    if (
      typeof record.accountId !== "string"
      || typeof record.displayName !== "string"
      || typeof record.longitude !== "number"
      || typeof record.latitude !== "number"
      || typeof record.accuracyMeters !== "number"
      || typeof record.capturedAt !== "string"
      || typeof record.expiresAt !== "string"
    ) return null;
    parsed.push(record as GroupMemberLocation);
  }
  return parsed;
}

export function TravelGroupNavigator({ onMembersChange }: TravelGroupNavigatorProps) {
  const [groupName, setGroupName] = useState("我的旅行小队");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("位置共享默认关闭；只有主动加入同一小队的成员可以读取最新位置。");
  const [members, setMembers] = useState<GroupMemberLocation[]>([]);
  const [viewerSample, setViewerSample] = useState<GroupLocationUpdate | null>(null);
  const groupIdRef = useRef<string | null>(null);
  const sharingRef = useRef(false);
  const watchRef = useRef<number | null>(null);
  const lastUploadAtRef = useRef(0);
  const shareSessionRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setInviteToken(readInviteToken()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  const relativeMembers = useMemo(() => {
    if (!viewerSample) return [];
    const now = new Date();
    return members.map((member) => relativeGroupMemberLocation(viewerSample, member, now)).filter((member) => member !== null);
  }, [members, viewerSample]);

  useEffect(() => {
    const next = relativeMembers.map((member) => ({
      accountId: member.accountId,
      displayName: member.displayName,
      longitude: member.longitude,
      latitude: member.latitude,
      distanceMeters: member.distanceMeters,
      direction: member.direction,
    }));
    onMembersChange?.(next);
    publishTravelGroupMapMembers(next);
  }, [onMembersChange, relativeMembers]);

  const loadMembers = useCallback(async (targetGroupId: string) => {
    try {
      const response = await fetch(`/api/v1/travel-groups/${encodeURIComponent(targetGroupId)}/locations`, { cache: "no-store" });
      const body = await response.json() as unknown;
      const next = response.ok ? parseMembers(body) : null;
      if (!next) {
        if (!response.ok) setMessage(apiMessage(body, "暂时无法读取同行位置。"));
        return;
      }
      setMembers(next);
    } catch {
      setMessage("网络不可用，同行位置不会使用旧缓存。 ");
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const initial = window.setTimeout(() => { void loadMembers(groupId); }, 0);
    const interval = window.setInterval(() => { void loadMembers(groupId); }, 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [groupId, loadMembers]);

  const stopWatch = useCallback(() => {
    if (watchRef.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    lastUploadAtRef.current = 0;
  }, []);

  const stopSharing = useCallback(async (silent = false) => {
    shareSessionRef.current += 1;
    stopWatch();
    const targetGroupId = groupIdRef.current;
    const wasSharing = sharingRef.current;
    sharingRef.current = false;
    setSharing(false);
    setViewerSample(null);
    setMembers([]);
    onMembersChange?.([]);
    publishTravelGroupMapMembers([]);
    if (!targetGroupId || !wasSharing) return;
    try {
      await fetch(`/api/v1/travel-groups/${encodeURIComponent(targetGroupId)}/location-share`, {
        method: "POST",
        cache: "no-store",
        keepalive: silent,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "STOP", reason: "USER_STOPPED" }),
      });
      if (!silent) setMessage("已停止共享，并删除当前小队位置快照。 ");
    } catch {
      if (!silent) setMessage("停止请求未确认送达；服务器位置快照仍会在两分钟内自动失效。 ");
    }
  }, [onMembersChange, stopWatch]);

  useEffect(() => {
    const stopForBackground = () => {
      if (!sharingRef.current) return;
      setMessage("页面已离开前台，同行位置共享已停止；返回后不会自动恢复。 ");
      void stopSharing(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopForBackground();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", stopForBackground);
    document.addEventListener("freeze", stopForBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", stopForBackground);
      document.removeEventListener("freeze", stopForBackground);
    };
  }, [stopSharing]);

  useEffect(() => {
    if (!("permissions" in navigator) || typeof navigator.permissions.query !== "function") return;
    let cancelled = false;
    let permission: PermissionStatus | null = null;
    const applyPermission = () => {
      if (cancelled || !permission || !sharingRef.current) return;
      if (normalizeGeolocationPermissionState(permission.state) === "GRANTED") return;
      setMessage("定位权限已撤回，同行位置共享已停止；重新授权后仍需你主动开启。 ");
      // Keep the permission-specific safety explanation visible. The generic
      // manual-stop confirmation must not overwrite why sharing was stopped.
      void stopSharing(true);
    };
    void navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (cancelled) return;
      permission = result;
      applyPermission();
      permission.addEventListener("change", applyPermission);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      permission?.removeEventListener("change", applyPermission);
    };
  }, [stopSharing]);

  useEffect(() => () => {
    shareSessionRef.current += 1;
    stopWatch();
    const targetGroupId = groupIdRef.current;
    if (!sharingRef.current || !targetGroupId) return;
    sharingRef.current = false;
    void fetch(`/api/v1/travel-groups/${encodeURIComponent(targetGroupId)}/location-share`, {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "STOP", reason: "USER_STOPPED" }),
    }).catch(() => undefined);
  }, [stopWatch]);

  async function createGroup() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/travel-groups", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": randomIdempotencyKey() },
        body: JSON.stringify({ name: groupName.trim(), expiresInMinutes: 480 }),
      });
      const body = await response.json() as unknown;
      const group = body && typeof body === "object" ? (body as { group?: unknown }).group : null;
      if (!response.ok || !group || typeof group !== "object" || typeof (group as { id?: unknown }).id !== "string") {
        setMessage(apiMessage(body, "暂时无法创建旅行小队。"));
        return;
      }
      const id = (group as { id: string }).id;
      setGroupId(id);
      setInviteToken(null);
      setMessage("旅行小队已创建。邀请链接只授予加入权限，不会自动开启位置共享。 ");
    } catch {
      setMessage("网络不可用，旅行小队没有创建。 ");
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    if (!groupId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/travel-groups/${encodeURIComponent(groupId)}/invites`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": randomIdempotencyKey() },
        body: JSON.stringify({ expiresInMinutes: 60, maxUses: 8 }),
      });
      const body = await response.json() as unknown;
      const invite = body && typeof body === "object" ? (body as { invite?: unknown }).invite : null;
      const token = invite && typeof invite === "object" ? (invite as { token?: unknown }).token : null;
      if (!response.ok || typeof token !== "string") {
        setMessage(apiMessage(body, "暂时无法创建邀请。"));
        return;
      }
      const link = `${window.location.origin}${window.location.pathname}#team-invite=${token}`;
      setInviteLink(link);
      await navigator.clipboard?.writeText(link);
      setMessage("邀请链接已复制；链接 60 分钟后过期。 ");
    } catch {
      setMessage("邀请未创建或未能复制，请重试。 ");
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvite() {
    if (!inviteToken) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/travel-group-invites/accept", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const body = await response.json() as unknown;
      const acceptedGroupId = body && typeof body === "object" ? (body as { groupId?: unknown }).groupId : null;
      if (!response.ok || typeof acceptedGroupId !== "string") {
        setMessage(apiMessage(body, "无法加入旅行小队。"));
        return;
      }
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setInviteToken(null);
      setGroupId(acceptedGroupId);
      setMessage("已加入旅行小队；位置共享仍保持关闭。 ");
    } catch {
      setMessage("网络不可用，尚未加入旅行小队。 ");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPosition(targetGroupId: string, position: GeolocationPosition, shareSession: number) {
    if (!sharingRef.current || shareSessionRef.current !== shareSession) return;
    const sample = {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      accuracyMeters: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString(),
    };
    const parsed = parseFreshGroupLocationUpdate(sample);
    if (!parsed) {
      setMessage("本次位置精度不足、过期或异常，未发送给小队。 ");
      return;
    }
    setViewerSample(parsed);
    try {
      const response = await fetch(`/api/v1/travel-groups/${encodeURIComponent(targetGroupId)}/location`, {
        method: "PUT",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await response.json() as unknown;
      if (!sharingRef.current || shareSessionRef.current !== shareSession) return;
      if (!response.ok) {
        setMessage(apiMessage(body, "位置共享已停止。"));
        await stopSharing();
        return;
      }
      setMessage("正在共享最新位置；离开页面、主动停止或会话到期后即不可读。 ");
      await loadMembers(targetGroupId);
    } catch {
      if (!sharingRef.current || shareSessionRef.current !== shareSession) return;
      setMessage("位置更新未送达；不会把旧位置当作实时位置。 ");
    }
  }

  async function startSharing() {
    if (!groupId || !("geolocation" in navigator)) {
      setMessage("当前浏览器无法开启小队位置共享。 ");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/travel-groups/${encodeURIComponent(groupId)}/location-share`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": randomIdempotencyKey() },
        body: JSON.stringify({ action: "START", expiresInMinutes: 120, consentRevision: 1 }),
      });
      const body = await response.json() as unknown;
      if (!response.ok) {
        setMessage(apiMessage(body, "无法开始位置共享。"));
        return;
      }
      const shareSession = shareSessionRef.current + 1;
      shareSessionRef.current = shareSession;
      setSharing(true);
      sharingRef.current = true;
      if (document.visibilityState !== "visible") {
        setMessage("页面已离开前台，同行位置共享没有启动；返回后需要你重新开启。 ");
        await stopSharing(true);
        return;
      }
      setMessage("已授权最多两小时的小队位置共享，正在等待可靠 GPS。 ");
      watchRef.current = navigator.geolocation.watchPosition((position) => {
        if (!sharingRef.current || shareSessionRef.current !== shareSession) return;
        const timestamp = Date.now();
        if (timestamp - lastUploadAtRef.current < 5_000) return;
        lastUploadAtRef.current = timestamp;
        void uploadPosition(groupId, position, shareSession);
      }, () => {
        if (!sharingRef.current || shareSessionRef.current !== shareSession) return;
        setMessage("定位权限不可用，位置共享已停止。 ");
        void stopSharing();
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
    } catch {
      setMessage("网络不可用，位置共享没有开始。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="border-t border-[#173f35]/10 bg-white p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#173f35] outline-none focus-visible:ring-3 focus-visible:ring-[#b88a43]"><UsersThree size={20} weight="duotone" />好友同行导航</summary>
      <p className="mt-2 text-xs leading-5 text-[#61716a]">仅限登录成员自愿加入的临时小队。服务端只覆盖保存每人最新一个点，最长两分钟失效，不建立轨迹。</p>

      {inviteToken && !groupId && <button type="button" onClick={() => void acceptInvite()} disabled={busy} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white disabled:opacity-55"><LinkSimple size={18} />接受邀请并加入</button>}

      {!groupId && !inviteToken && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor="travel-group-name">旅行小队名称</label>
        <input id="travel-group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={80} className="min-h-11 rounded-xl border border-[#173f35]/16 bg-white px-3 text-sm" />
        <button type="button" onClick={() => void createGroup()} disabled={busy || !groupName.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-semibold text-white disabled:opacity-55"><UsersThree size={18} />创建小队</button>
      </div>}

      {groupId && <>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void createInvite()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#173f35]/16 bg-white px-3 text-sm font-semibold text-[#173f35] disabled:opacity-55"><Copy size={18} />邀请好友</button>
          {!sharing ? <button type="button" onClick={() => void startSharing()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2369d8] px-3 text-sm font-semibold text-white disabled:opacity-55"><Crosshair size={18} />共享实时位置</button> : <button type="button" onClick={() => void stopSharing()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#9b453c] px-3 text-sm font-semibold text-white disabled:opacity-55"><MapPin size={18} />停止共享</button>}
          <span className="flex min-h-11 items-center justify-center rounded-xl bg-[#eef3ee] px-3 text-xs text-[#52675d]">{relativeMembers.length} 个可靠同行位置</span>
        </div>
        {relativeMembers.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">{relativeMembers.map((member) => <li key={member.accountId} className="rounded-xl border border-[#173f35]/10 bg-[#f5f7f3] p-3 text-sm"><strong className="block text-[#173f35]">{member.displayName}</strong><span className="mt-1 block text-xs text-[#61716a]">{member.direction} · 约 {member.distanceMeters >= 1000 ? `${(member.distanceMeters / 1000).toFixed(1)} km` : `${Math.ceil(member.distanceMeters)} m`}</span></li>)}</ul>}
      </>}

      {inviteLink && <p className="mt-3 break-all rounded-xl bg-[#f5f0e5] p-3 text-[11px] leading-5 text-[#61716a]">邀请链接已生成并尝试复制：{inviteLink}</p>}
      <p role="status" aria-live="polite" className="mt-3 text-xs leading-5 text-[#61716a]">{busy && <SpinnerGap className="mr-1 inline animate-spin motion-reduce:animate-none" size={15} />}{message}</p>
    </details>
  );
}
