export const SCENIC_SPOT_IDS = [
  "guoen-temple",
  "huineng-residence",
  "zangfo-valley",
  "longshan-spring",
  "chanyu-town",
] as const;

export type ScenicSpotId = (typeof SCENIC_SPOT_IDS)[number];
export type ScenicImageRelation = "EXACT_SPOT" | "REGIONAL_CONTEXT" | "NEARBY_ARRIVAL_CONTEXT";

export type ScenicImageAsset = {
  id: string;
  src: string;
  originalSrc: string | null;
  originalSha256: string | null;
  width: number;
  height: number;
  sha256: string;
  alt: string;
  subjectLabel: string;
  relation: ScenicImageRelation;
  exactSpotIds: readonly ScenicSpotId[];
  contextualSpotIds: readonly ScenicSpotId[];
  creator: string;
  sourcePage: string;
  sourceOriginalUrl: string;
  license: "CC BY 3.0" | "CC BY-SA 4.0" | "用户提供授权素材";
  licenseUrl: string;
  downloadedAt: "2026-08-15" | "2026-08-17";
  publishable: boolean;
  restriction: string;
};

export const SCENIC_IMAGE_ASSETS = {
  "guoen-temple-pkkj-20260527": {
    id: "guoen-temple-pkkj-20260527",
    src: "/assets/media/scenic/licensed/guoen-temple-20260527-1280.jpg",
    originalSrc: "/assets/media/scenic/v2/guoen-temple-pkkj-20260527-original.jpg",
    originalSha256: "7286da5f7153c6b73dd27311d28f4b66416128971e1b7dbafe7d5ea4bfd891b3",
    width: 1280,
    height: 964,
    sha256: "e3a3d1a548a765dc6a05770333f5530e20a7880bef22a535f4091d8a299c4ce1",
    alt: "广东新兴县国恩寺实景",
    subjectLabel: "国恩寺",
    relation: "EXACT_SPOT",
    exactSpotIds: ["guoen-temple"],
    contextualSpotIds: [],
    creator: "Pkkj",
    sourcePage: "https://commons.wikimedia.org/wiki/File:%E5%9B%BD%E6%81%A9%E5%AF%BA_20260527_144925.jpg",
    sourceOriginalUrl: "https://upload.wikimedia.org/wikipedia/commons/0/09/%E5%9B%BD%E6%81%A9%E5%AF%BA_20260527_144925.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    downloadedAt: "2026-08-15",
    publishable: true,
    restriction: "只证明照片主体为国恩寺，不证明当前开放、入口、客流或路线状态。",
  },
  "xinxing-tianlu-qiumao-20160326-01": {
    id: "xinxing-tianlu-qiumao-20160326-01",
    src: "/assets/media/scenic/licensed/xinxing-tianlu-01.jpg",
    originalSrc: "/assets/media/scenic/v2/xinxing-tianlu-qiumao-20160326-01-original.jpg",
    originalSha256: "4277bb93a9ac809db5bc3405cde785f24484c441b3bcdb94870c6f8b0a2290cb",
    width: 1280,
    height: 851,
    sha256: "e2498133a23ece1876f449e4a97e377a4fe8df38bd93d0ebaa4fba92a673000c",
    alt: "广东新兴县天露山山地环境实景",
    subjectLabel: "新兴县天露山",
    relation: "REGIONAL_CONTEXT",
    exactSpotIds: [],
    contextualSpotIds: ["huineng-residence", "chanyu-town"],
    creator: "Qiu Mao",
    sourcePage: "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(1).jpg",
    sourceOriginalUrl: "https://upload.wikimedia.org/wikipedia/commons/4/48/%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_%281%29.jpg",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    downloadedAt: "2026-08-15",
    publishable: true,
    restriction: "仅作新兴县周边自然环境语境，不得标成六祖镇或任一具体景点本体。",
  },
  "xinxing-tianlu-qiumao-20160326-10": {
    id: "xinxing-tianlu-qiumao-20160326-10",
    src: "/assets/media/scenic/licensed/xinxing-tianlu-02.jpg",
    originalSrc: null,
    originalSha256: null,
    width: 1280,
    height: 851,
    sha256: "b1c6cc00dcc9937c3e1fdb087ca9ea7dd0352ac1a35fa4e85a237e68fff98b37",
    alt: "广东新兴县天露山山地环境实景",
    subjectLabel: "新兴县天露山",
    relation: "REGIONAL_CONTEXT",
    exactSpotIds: [],
    contextualSpotIds: ["zangfo-valley"],
    creator: "Qiu Mao",
    sourcePage: "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(10).jpg",
    sourceOriginalUrl: "https://upload.wikimedia.org/wikipedia/commons/0/06/%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_%2810%29.jpg",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    downloadedAt: "2026-08-15",
    publishable: true,
    restriction: "仅作新兴县周边自然环境语境，不得标成六祖镇或任一具体景点本体。",
  },
  "xinxing-tianlu-qiumao-20160326-20": {
    id: "xinxing-tianlu-qiumao-20160326-20",
    src: "/assets/media/scenic/licensed/xinxing-tianlu-03.jpg",
    originalSrc: null,
    originalSha256: null,
    width: 1280,
    height: 851,
    sha256: "8699e376fe0fd6599cb8f9103413786f2cd898bd8efc2fcb290cd58082905ae2",
    alt: "广东新兴县天露山山地环境实景",
    subjectLabel: "新兴县天露山",
    relation: "REGIONAL_CONTEXT",
    exactSpotIds: [],
    contextualSpotIds: ["longshan-spring"],
    creator: "Qiu Mao",
    sourcePage: "https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_(20).jpg",
    sourceOriginalUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c4/%E5%A4%A9%E9%9C%B2%E5%B1%B1%E8%B6%8A%E9%87%8E%E7%A9%BF%E8%B6%8A20160326_-_panoramio_%2820%29.jpg",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    downloadedAt: "2026-08-15",
    publishable: true,
    restriction: "仅作新兴县周边自然环境语境，不得标成六祖镇或任一具体景点本体。",
  },
  "guoen-temple-user-restored-20260817": {
    id: "guoen-temple-user-restored-20260817",
    src: "/assets/scenic/user-v1/guoen-temple-hero.webp",
    originalSrc: null,
    originalSha256: "4779683e3503aeacf446d9b25e6dd9bda9a93609e495e3e2f43ea1e278c28a94",
    width: 1600,
    height: 900,
    sha256: "94da1bcb6229b454cfb2ea3eade6edf38b3de5b844eec7f2b274da127af55fa1",
    alt: "国恩寺入口台阶与山门实景",
    subjectLabel: "国恩寺",
    relation: "EXACT_SPOT",
    exactSpotIds: ["guoen-temple"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://guoen-temple-3",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的截图提取并经 AI 画质修复；不证明实时开放、客流或路线状态。",
  },
  "huineng-residence-user-restored-20260817": {
    id: "huineng-residence-user-restored-20260817",
    src: "/assets/scenic/user-v1/huineng-residence-hero.webp",
    originalSrc: null,
    originalSha256: "2448d0c70b58461bfdaf003d2e2c0ff7c96429811655e0f7f9fd1120a47ab4ae",
    width: 1600,
    height: 900,
    sha256: "2399032513fe3c0188de17e653aef07e23a4277e2f7462886a469e0b91a75364",
    alt: "六祖惠能故居红柱厅堂与庭院实景",
    subjectLabel: "六祖惠能故居",
    relation: "EXACT_SPOT",
    exactSpotIds: ["huineng-residence"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://huineng-residence-3",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的截图提取并经 AI 画质修复；不证明实时开放、客流或路线状态。",
  },
  "longshan-spring-user-restored-20260817": {
    id: "longshan-spring-user-restored-20260817",
    src: "/assets/scenic/user-v1/longshan-spring-hero.webp",
    originalSrc: null,
    originalSha256: "5c8c65e07317412e9a596bd1218766b705f75ad1539afb839d5d8cb11899c902",
    width: 1600,
    height: 900,
    sha256: "e0e813041fbf38753634e07408871e90fc2e31f3187e4da2eb22ef14a858cc7b",
    alt: "龙山温泉户外泡池与园林实景",
    subjectLabel: "龙山温泉",
    relation: "EXACT_SPOT",
    exactSpotIds: ["longshan-spring"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://longshan-spring-3",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的图片经 AI 画质修复；不证明实时开放、客流或路线状态。",
  },
  "chanyu-town-user-restored-20260817": {
    id: "chanyu-town-user-restored-20260817",
    src: "/assets/scenic/user-v1/chanyu-town-hero.webp",
    originalSrc: null,
    originalSha256: "921266f1b948c7d172cb7e4bc5bf9cf3df78f4500ef53a66bf441d8e5a3bc59d",
    width: 1600,
    height: 900,
    sha256: "72047c4a23574e983d0c5d4e99724e9c87ad7c0998a7420233575aa1ac8a6e0c",
    alt: "禅域小镇傍晚桥景与街区实景",
    subjectLabel: "禅域小镇",
    relation: "EXACT_SPOT",
    exactSpotIds: ["chanyu-town"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://chanyu-town-3",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的图片经 AI 画质修复；不证明实时开放、客流或路线状态。",
  },
  "zangfo-waterwheel-user-restored-20260817": {
    id: "zangfo-waterwheel-user-restored-20260817",
    src: "/assets/scenic/user-v2/zangfo-waterwheel.webp",
    originalSrc: null,
    originalSha256: "70f78f9ea708a40606f04034056a5d3d58b09de447f067a29f3fa847aa2d2507",
    width: 1600,
    height: 900,
    sha256: "1c0b9c5a96f9ad5c9317ef63e2d4c8469bd6bd048f9c06a53c64a6ba43b11f47",
    alt: "藏佛坑林间水车与溪谷实景",
    subjectLabel: "藏佛坑",
    relation: "EXACT_SPOT",
    exactSpotIds: ["zangfo-valley"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://zangfo-valley-waterwheel",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的藏佛坑实景图片裁切、清晰化并适配网页；不证明实时开放、客流或路线状态。",
  },
  "zangfo-pond-user-restored-20260817": {
    id: "zangfo-pond-user-restored-20260817",
    src: "/assets/scenic/user-v2/zangfo-pond.webp",
    originalSrc: null,
    originalSha256: "914ac40c070503ef013d9d8d13cf5169521db5cfaedebf66c55a5d2431da69ca",
    width: 1600,
    height: 900,
    sha256: "b3e0da9ecfa4faddf691b0f4767854ce77966c87bfd2de6022c692397602e1f9",
    alt: "藏佛坑锦鲤池与林间灯笼实景",
    subjectLabel: "藏佛坑",
    relation: "EXACT_SPOT",
    exactSpotIds: ["zangfo-valley"],
    contextualSpotIds: [],
    creator: "用户提供实景影像",
    sourcePage: "/privacy",
    sourceOriginalUrl: "local-user-material://zangfo-valley-pond",
    license: "用户提供授权素材",
    licenseUrl: "/privacy",
    downloadedAt: "2026-08-17",
    publishable: false,
    restriction: "由用户提供的藏佛坑实景图片裁切、清晰化并适配网页；不证明实时开放、客流或路线状态。",
  },
} as const satisfies Record<string, ScenicImageAsset>;

export type ScenicImageAssetId = keyof typeof SCENIC_IMAGE_ASSETS;

export const SCENIC_SPOT_MEDIA = {
  "guoen-temple": {
    status: "EXACT_LICENSED",
    exactAssetIds: ["guoen-temple-user-restored-20260817", "guoen-temple-pkkj-20260527"],
    contextualAssetIds: [],
  },
  "huineng-residence": {
    status: "CONTEXT_ONLY",
    exactAssetIds: ["huineng-residence-user-restored-20260817"],
    contextualAssetIds: ["xinxing-tianlu-qiumao-20160326-01"],
  },
  "zangfo-valley": {
    status: "CONTEXT_ONLY",
    exactAssetIds: ["zangfo-waterwheel-user-restored-20260817", "zangfo-pond-user-restored-20260817"],
    contextualAssetIds: ["xinxing-tianlu-qiumao-20160326-10"],
  },
  "longshan-spring": {
    status: "CONTEXT_ONLY",
    exactAssetIds: ["longshan-spring-user-restored-20260817"],
    contextualAssetIds: ["xinxing-tianlu-qiumao-20160326-20"],
  },
  "chanyu-town": {
    status: "CONTEXT_ONLY",
    exactAssetIds: ["chanyu-town-user-restored-20260817"],
    contextualAssetIds: ["xinxing-tianlu-qiumao-20160326-01"],
  },
} as const satisfies Record<ScenicSpotId, {
  status: "EXACT_LICENSED" | "CONTEXT_ONLY" | "MISSING_AUTHORIZED_PHOTO";
  exactAssetIds: readonly ScenicImageAssetId[];
  contextualAssetIds: readonly ScenicImageAssetId[];
}>;

export type ScenicImageSelection = {
  asset: ScenicImageAsset;
  relation: "EXACT_SPOT" | "CONTEXT_ONLY";
  disclosure: string | null;
};

export function getScenicSpotImage(
  spotId: ScenicSpotId | string,
  options: { allowContextual?: boolean } = {},
): ScenicImageSelection | null {
  const coverage = SCENIC_SPOT_MEDIA[spotId as ScenicSpotId];
  if (!coverage) return null;
  const exactIds = (coverage.exactAssetIds || []) as readonly ScenicImageAssetId[];
  const contextualIds = (coverage.contextualAssetIds || []) as readonly ScenicImageAssetId[];
  const exactId = exactIds.find((id) => SCENIC_IMAGE_ASSETS[id].publishable);
  if (exactId && SCENIC_IMAGE_ASSETS[exactId]) {
    return { asset: SCENIC_IMAGE_ASSETS[exactId], relation: "EXACT_SPOT", disclosure: null };
  }

  if (!options.allowContextual) return null;
  const contextualId = contextualIds.find((id) => SCENIC_IMAGE_ASSETS[id].publishable);
  if (!contextualId || !SCENIC_IMAGE_ASSETS[contextualId]) return null;

  return {
    asset: SCENIC_IMAGE_ASSETS[contextualId],
    relation: "CONTEXT_ONLY",
    disclosure: "新兴县周边实景，非本景点；仅作区域环境语境。",
  };
}


export function getScenicSpotGallery(spotId: ScenicSpotId | string): ScenicImageSelection[] {
  const coverage = SCENIC_SPOT_MEDIA[spotId as ScenicSpotId];
  if (!coverage) return [];
  const exactIds = (coverage.exactAssetIds || []) as readonly ScenicImageAssetId[];
  return exactIds
    .filter((assetId) => Boolean(SCENIC_IMAGE_ASSETS[assetId]))
    .map((assetId) => ({
      asset: SCENIC_IMAGE_ASSETS[assetId],
      relation: "EXACT_SPOT" as const,
      disclosure: null,
    }));
}

