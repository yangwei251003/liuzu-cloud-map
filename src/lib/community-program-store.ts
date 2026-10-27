"use client";

export type CommunityProgramKind = "TOPIC" | "CHALLENGE" | "OFFICIAL_EVENT";

export type CommunityProgram = {
  id: string;
  kind: CommunityProgramKind;
  placeId: string;
  title: string;
  summary: string;
  creatorLabel: string;
  createdAt: string;
};

const STORAGE_KEY = "liuzu-community-programs-v1";
const CHANGE_EVENT = "liuzu-community-programs-change";

const SEEDED_PROGRAMS: readonly CommunityProgram[] = [
  { id: "seed-topic-chan-culture", kind: "TOPIC", placeId: "guoen-temple", title: "你最想听哪段六祖故事？", summary: "分享你感兴趣的人物、建筑或文化线索，一起完善下一次慢游主题。", creatorLabel: "六祖云游社区", createdAt: "2026-08-17T08:00:00.000Z" },
  { id: "seed-challenge-photo", kind: "CHALLENGE", placeId: "chanyu-town", title: "小镇光影摄影挑战", summary: "拍下桥影、灯色或街巷细节，带话题发布你的旅行视角。", creatorLabel: "旅行玩家", createdAt: "2026-08-17T08:10:00.000Z" },
  { id: "seed-event-slow-tour", kind: "OFFICIAL_EVENT", placeId: "all", title: "周末文化慢游征集", summary: "发布你的半日路线与实景照片，优质内容将进入社区精选。", creatorLabel: "六祖云游运营", createdAt: "2026-08-17T08:20:00.000Z" },
];

let memorySnapshot: readonly CommunityProgram[] = SEEDED_PROGRAMS;

function readStorage(): readonly CommunityProgram[] {
  if (typeof window === "undefined") return SEEDED_PROGRAMS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEEDED_PROGRAMS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return SEEDED_PROGRAMS;
    const valid = parsed.filter((value): value is CommunityProgram => {
      if (!value || typeof value !== "object") return false;
      const item = value as Partial<CommunityProgram>;
      return typeof item.id === "string"
        && ["TOPIC", "CHALLENGE", "OFFICIAL_EVENT"].includes(item.kind ?? "")
        && typeof item.placeId === "string"
        && typeof item.title === "string"
        && typeof item.summary === "string"
        && typeof item.creatorLabel === "string"
        && typeof item.createdAt === "string";
    });
    return [...valid, ...SEEDED_PROGRAMS.filter((seed) => !valid.some((item) => item.id === seed.id))];
  } catch {
    return SEEDED_PROGRAMS;
  }
}

export function getCommunityProgramsSnapshot() {
  return memorySnapshot;
}

export function getCommunityProgramsServerSnapshot() {
  return SEEDED_PROGRAMS;
}

export function subscribeCommunityPrograms(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  memorySnapshot = readStorage();
  const handler = () => {
    memorySnapshot = readStorage();
    listener();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function createCommunityProgram(input: Omit<CommunityProgram, "id" | "createdAt">) {
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (title.length < 4 || title.length > 48) return { ok: false as const, error: "标题请保持在 4–48 个字。" };
  if (summary.length < 8 || summary.length > 180) return { ok: false as const, error: "介绍请保持在 8–180 个字。" };
  const item: CommunityProgram = {
    ...input,
    id: crypto.randomUUID(),
    title,
    summary,
    createdAt: new Date().toISOString(),
  };
  try {
    const next = [item, ...readStorage().filter((entry) => !entry.id.startsWith("seed-"))];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memorySnapshot = [...next, ...SEEDED_PROGRAMS];
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return { ok: true as const, item };
  } catch {
    return { ok: false as const, error: "当前浏览器无法保存，请稍后重试。" };
  }
}
