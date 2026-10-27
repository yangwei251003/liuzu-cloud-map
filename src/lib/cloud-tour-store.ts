import { resolveCloudTourSelection } from "./cloud-tour";

export const CLOUD_TOUR_STORAGE_KEY = "liuzu-cloud-tour-progress-v1";

export type CloudTourProgress = {
  version: 1;
  selectionKind: "route" | "station";
  selectionId: string;
  stopIds: string[];
  currentIndex: number;
  visitedStopIds: string[];
  stampedStopIds: string[];
  status: "IN_PROGRESS" | "COMPLETED";
  updatedAt: string;
};

export type CloudTourStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const progressKeys = [
  "version",
  "selectionKind",
  "selectionId",
  "stopIds",
  "currentIndex",
  "visitedStopIds",
  "stampedStopIds",
  "status",
  "updatedAt",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0) && new Set(value).size === value.length;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseCloudTourProgress(value: unknown): CloudTourProgress | null {
  if (!isRecord(value) || Object.keys(value).length !== progressKeys.length || progressKeys.some((key) => !(key in value))) {
    return null;
  }

  const selectionKind = value.selectionKind;
  const selectionId = value.selectionId;
  const stopIds = value.stopIds;
  const currentIndex = value.currentIndex;
  const visitedStopIds = value.visitedStopIds;
  const stampedStopIds = value.stampedStopIds;
  const status = value.status;
  const updatedAt = value.updatedAt;

  if (
    value.version !== 1 ||
    (selectionKind !== "route" && selectionKind !== "station") ||
    typeof selectionId !== "string" ||
    !isUniqueStringArray(stopIds) ||
    typeof currentIndex !== "number" ||
    !Number.isInteger(currentIndex) ||
    !isUniqueStringArray(visitedStopIds) ||
    (!Array.isArray(stampedStopIds) || !stampedStopIds.every((item) => typeof item === "string") || new Set(stampedStopIds).size !== stampedStopIds.length) ||
    (status !== "IN_PROGRESS" && status !== "COMPLETED") ||
    typeof updatedAt !== "string" ||
    Number.isNaN(new Date(updatedAt).getTime())
  ) {
    return null;
  }

  const checkedStampedStopIds = stampedStopIds as string[];
  const selection = resolveCloudTourSelection(selectionKind, selectionId);
  if (!selection || !arraysEqual(stopIds, selection.stopIds)) return null;
  if (currentIndex < 0 || currentIndex >= stopIds.length) return null;

  const visited = new Set(visitedStopIds);
  const stamped = new Set(checkedStampedStopIds);
  const highestVisitedIndex = Math.max(...visitedStopIds.map((stopId) => stopIds.indexOf(stopId)));
  if (
    visitedStopIds.some((stopId) => !stopIds.includes(stopId)) ||
    checkedStampedStopIds.some((stopId) => !stopIds.includes(stopId)) ||
    !visited.has(stopIds[currentIndex]) ||
    highestVisitedIndex < currentIndex ||
    !arraysEqual(visitedStopIds, stopIds.slice(0, highestVisitedIndex + 1)) ||
    [...stamped].some((stopId) => !visited.has(stopId))
  ) {
    return null;
  }

  if (status === "COMPLETED" && (currentIndex !== stopIds.length - 1 || visitedStopIds.length !== stopIds.length)) {
    return null;
  }

  return {
    version: 1,
    selectionKind,
    selectionId,
    stopIds: [...stopIds],
    currentIndex,
    visitedStopIds: [...visitedStopIds],
    stampedStopIds: [...checkedStampedStopIds],
    status,
    updatedAt,
  };
}

export function createCloudTourProgress(
  selectionKind: "route" | "station",
  selectionId: string,
  now = new Date(),
): CloudTourProgress {
  const selection = resolveCloudTourSelection(selectionKind, selectionId);
  if (!selection) throw new Error("unknown_cloud_tour_selection");

  return {
    version: 1,
    selectionKind,
    selectionId,
    stopIds: [...selection.stopIds],
    currentIndex: 0,
    visitedStopIds: [selection.stopIds[0]],
    stampedStopIds: [],
    status: "IN_PROGRESS",
    updatedAt: now.toISOString(),
  };
}

export function moveCloudTourProgress(progress: CloudTourProgress, nextIndex: number, now = new Date()): CloudTourProgress {
  if (progress.status !== "IN_PROGRESS" || !Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= progress.stopIds.length) {
    throw new Error("invalid_cloud_tour_transition");
  }
  if (nextIndex > progress.visitedStopIds.length) throw new Error("cannot_skip_cloud_tour_chapter");

  const visitedStopIds = nextIndex === progress.visitedStopIds.length
    ? [...progress.visitedStopIds, progress.stopIds[nextIndex]]
    : [...progress.visitedStopIds];

  return {
    ...progress,
    currentIndex: nextIndex,
    visitedStopIds,
    updatedAt: now.toISOString(),
  };
}

export function stampCloudTourProgress(progress: CloudTourProgress, stopId: string, now = new Date()): CloudTourProgress {
  if (progress.status !== "IN_PROGRESS" || !progress.visitedStopIds.includes(stopId)) {
    throw new Error("invalid_cloud_tour_stamp");
  }
  if (progress.stampedStopIds.includes(stopId)) return progress;

  return {
    ...progress,
    stampedStopIds: [...progress.stampedStopIds, stopId],
    updatedAt: now.toISOString(),
  };
}

export function completeCloudTourProgress(progress: CloudTourProgress, now = new Date()): CloudTourProgress {
  if (
    progress.status !== "IN_PROGRESS" ||
    progress.currentIndex !== progress.stopIds.length - 1 ||
    progress.visitedStopIds.length !== progress.stopIds.length
  ) {
    throw new Error("cloud_tour_not_ready_to_complete");
  }

  return {
    ...progress,
    status: "COMPLETED",
    updatedAt: now.toISOString(),
  };
}

function resolveStorage(storage?: CloudTourStorage): CloudTourStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readCloudTourProgress(storage?: CloudTourStorage): { progress: CloudTourProgress | null; error: string | null } {
  const target = resolveStorage(storage);
  if (!target) return { progress: null, error: null };

  try {
    const raw = target.getItem(CLOUD_TOUR_STORAGE_KEY);
    if (!raw) return { progress: null, error: null };
    const progress = parseCloudTourProgress(JSON.parse(raw));
    if (!progress) return { progress: null, error: "上次云游记录已失效，系统没有把不完整数据当成可恢复进度。" };
    return { progress, error: null };
  } catch {
    return { progress: null, error: "浏览器未能读取上次云游记录；你仍可从头体验。" };
  }
}

export function writeCloudTourProgress(progress: CloudTourProgress, storage?: CloudTourStorage): { ok: boolean; error?: string } {
  const target = resolveStorage(storage);
  if (!target) return { ok: false, error: "当前环境不支持本机保存，刷新后进度可能丢失。" };
  if (!parseCloudTourProgress(progress)) return { ok: false, error: "进度数据未通过校验，系统没有保存。" };

  try {
    target.setItem(CLOUD_TOUR_STORAGE_KEY, JSON.stringify(progress));
    return { ok: true };
  } catch {
    return { ok: false, error: "浏览器未能保存云游进度；本页仍可继续，但刷新后可能无法恢复。" };
  }
}

export function clearCloudTourProgress(storage?: CloudTourStorage): { ok: boolean; error?: string } {
  const target = resolveStorage(storage);
  if (!target) return { ok: true };

  try {
    target.removeItem(CLOUD_TOUR_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: "浏览器未确认删除云游记录；本页已清空，但刷新后仍可能恢复旧记录。" };
  }
}
