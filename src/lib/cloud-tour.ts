import { getGuideSpotStory, type GuideSpotStory } from "./ai-guide/knowledge";
import type { AIGuideFactType } from "./ai-guide/types";
import { routeIdeas, scenicSpots, type ScenicSpot } from "./scenic-data";

export const CLOUD_TOUR_BOUNDARY_NOTICE =
  "这是线上内容体验：章节顺序不代表步行路线，不使用定位，也不提供入口、开放、交通或安全导航结论。";

export type CloudTourQuizOption = {
  id: string;
  label: string;
};

export type CloudTourQuiz = {
  id: string;
  question: string;
  options: CloudTourQuizOption[];
  correctOptionId: string;
  factType: AIGuideFactType;
  sourceId: string;
};

export type CloudTourStation = {
  id: string;
  spot: ScenicSpot;
  story: GuideSpotStory;
  quiz: CloudTourQuiz;
};

export type CloudTourRoute = {
  id: string;
  eyebrow: string;
  title: string;
  stopIds: string[];
  contentOrderNotice: string;
};

type QuizSeed = Omit<CloudTourQuiz, "factType" | "sourceId">;

const quizSeeds: Record<string, QuizSeed> = {
  "guoen-temple": {
    id: "guoen-record-scope",
    question: "国家文物局名录里的“明至民国”，在当前讲解中应怎样理解？",
    options: [
      { id: "heritage-scope", label: "保护对象的年代口径" },
      { id: "founding-year", label: "已经确认的寺院创建年份" },
      { id: "opening-hours", label: "今天的开放时段" },
    ],
    correctOptionId: "heritage-scope",
  },
  "huineng-residence": {
    id: "residence-source-scope",
    question: "从现有官方目的地介绍中，可以了解什么？",
    options: [
      { id: "candidate-node", label: "了解六祖故居这一文化地点" },
      { id: "official-entry", label: "确认正式入口与开放状态" },
      { id: "safe-route", label: "确认一条安全步行路线" },
    ],
    correctOptionId: "candidate-node",
  },
  "zangfo-valley": {
    id: "zangfo-boundary",
    question: "当前资料中的藏佛坑应如何展示？",
    options: [
      { id: "candidate-clue", label: "作为需要进一步核对的地点线索" },
      { id: "verified-trail", label: "作为已经复走的徒步路线" },
      { id: "live-status", label: "作为实时开放的景点" },
    ],
    correctOptionId: "candidate-clue",
  },
  "longshan-spring": {
    id: "longshan-source-scope",
    question: "关于龙山温泉，当前登记资料能够支持哪一项？",
    options: [
      { id: "experience-resource", label: "官方介绍把它列为当地体验资源" },
      { id: "open-now", label: "确认现在正在营业" },
      { id: "traffic-now", label: "确认当前交通状态" },
    ],
    correctOptionId: "experience-resource",
  },
  "chanyu-town": {
    id: "chanyu-content-boundary",
    question: "当前云游为什么不为禅域小镇补写文化故事？",
    options: [
      { id: "no-registered-story", label: "尚无可公开的已登记文化讲解" },
      { id: "permanently-closed", label: "已经确认永久关闭" },
      { id: "no-visitors", label: "已经确认没有游客" },
    ],
    correctOptionId: "no-registered-story",
  },
};

function buildStation(spot: ScenicSpot): CloudTourStation | null {
  const story = getGuideSpotStory(spot.id);
  const quizSeed = quizSeeds[spot.id];
  const primarySource = story?.sources[0];
  const factType = story?.factTypes[0];

  if (!story || !quizSeed || !primarySource || !factType) return null;
  if (!quizSeed.options.some((option) => option.id === quizSeed.correctOptionId)) return null;

  return {
    id: spot.id,
    spot,
    story,
    quiz: {
      ...quizSeed,
      factType,
      sourceId: primarySource.id,
    },
  };
}

export const cloudTourStations: CloudTourStation[] = scenicSpots
  .map(buildStation)
  .filter((station): station is CloudTourStation => station !== null);

const routeStopOrders: Record<string, string[]> = {
  "zen-origin": ["guoen-temple", "huineng-residence", "longshan-spring"],
  "slow-travel": ["guoen-temple", "longshan-spring"],
  family: ["huineng-residence", "guoen-temple"],
};

export const cloudTourRoutes: CloudTourRoute[] = routeIdeas.flatMap((idea) => {
  const stopIds = routeStopOrders[idea.id];
  if (!stopIds || stopIds.some((stopId) => !cloudTourStations.some((station) => station.id === stopId))) {
    return [];
  }

  return [{
    id: idea.id,
    eyebrow: idea.eyebrow,
    title: idea.title,
    stopIds: [...stopIds],
    contentOrderNotice: "仅为云游章节编排，不代表空间连接关系或现场游览路线。",
  }];
});

export function getCloudTourStation(id: string): CloudTourStation | null {
  return cloudTourStations.find((station) => station.id === id) ?? null;
}

export function getCloudTourRoute(id: string): CloudTourRoute | null {
  return cloudTourRoutes.find((route) => route.id === id) ?? null;
}

export function resolveCloudTourSelection(kind: "route" | "station", id: string) {
  if (kind === "route") {
    const route = getCloudTourRoute(id);
    return route
      ? { kind, id: route.id, title: route.title, stopIds: [...route.stopIds] }
      : null;
  }

  const station = getCloudTourStation(id);
  return station
    ? { kind, id: station.id, title: station.spot.name, stopIds: [station.id] }
    : null;
}

export function isCloudTourQuizChoiceCorrect(stationId: string, optionId: string): boolean {
  return getCloudTourStation(stationId)?.quiz.correctOptionId === optionId;
}
