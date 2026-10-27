import { SCENIC_IMAGE_ASSETS, type ScenicImageAsset } from "./scenic-image-registry";

export const PROMOTION_ROTATION_MS = 4_000;

export type PromotionMediaKind = "image" | "video";
export type PromotionMediaRelation = "EXACT_SPOT" | "REGIONAL_CONTEXT";

export type PromotionMediaItem = {
  id: string;
  kind: PromotionMediaKind;
  src: string;
  posterSrc?: string;
  fallbackSrc: string;
  alt: string;
  title: string;
  summary: string;
  relation: PromotionMediaRelation;
  disclosureLabel: string;
  disclosure: string;
  sourceLabel: string;
  sourceHref: string;
  licenseLabel: string;
  licenseHref?: string;
  officialReferenceHref: string;
};

export type PromotionConnectionProfile = {
  saveData?: boolean;
  effectiveType?: string;
};

export type PromotionStaticReason =
  | "save-data"
  | "slow-network"
  | null;

const DEFAULT_FALLBACK = "/assets/media/scenic/licensed/guoen-temple-20260527-1280.jpg";
const YUNFU_TOURISM_REFERENCE = "https://www.yunfu.gov.cn/zjyf/lyyf/msfj/content/post_1582810.html";
const XINXING_TOURISM_REFERENCE = "https://www.xinxing.gov.cn/gkmlpt/content/1/1983/post_1983944.html";

function scenicImageItem({
  id,
  asset,
  title,
  summary,
  officialReferenceHref,
}: {
  id: string;
  asset: ScenicImageAsset;
  title: string;
  summary: string;
  officialReferenceHref: string;
}): PromotionMediaItem {
  return {
    id,
    kind: "image",
    src: asset.src,
    fallbackSrc: DEFAULT_FALLBACK,
    alt: asset.alt,
    title,
    summary,
    relation: asset.relation === "EXACT_SPOT" ? "EXACT_SPOT" : "REGIONAL_CONTEXT",
    disclosureLabel: asset.relation === "EXACT_SPOT" ? "开放许可景点实景" : "新兴县周边实景 · 非本景点",
    disclosure: asset.restriction,
    sourceLabel: asset.creator,
    sourceHref: asset.sourcePage,
    licenseLabel: asset.license,
    licenseHref: asset.licenseUrl,
    officialReferenceHref,
  };
}

export const PROMOTION_MEDIA_ITEMS: readonly PromotionMediaItem[] = [
  scenicImageItem({ id: "guoen-temple-licensed", asset: SCENIC_IMAGE_ASSETS["guoen-temple-pkkj-20260527"], title: "国恩寺 · 开放许可实景", summary: "照片仅展示建筑文化背景，当前开放与参观要求待管理方公告。", officialReferenceHref: YUNFU_TOURISM_REFERENCE }),
  ...(["xinxing-tianlu-qiumao-20160326-01", "xinxing-tianlu-qiumao-20160326-10", "xinxing-tianlu-qiumao-20160326-20"] as const).map((id) => scenicImageItem({ id, asset: SCENIC_IMAGE_ASSETS[id], title: "新兴天露山 · 区域环境语境", summary: "天露山周边环境实景，不指代六祖镇或其他景点本体。", officialReferenceHref: XINXING_TOURISM_REFERENCE })),
];

export function wrapPromotionIndex(index: number, itemCount: number) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

export function promotionStaticReason({
  connection,
}: {
  connection?: PromotionConnectionProfile | null;
}): PromotionStaticReason {
  if (connection?.saveData) return "save-data";
  if (["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) return "slow-network";
  return null;
}

export function shouldAutoRotatePromotions({
  itemCount,
  userPaused,
  documentHidden,
  staticReason,
}: {
  itemCount: number;
  userPaused: boolean;
  documentHidden: boolean;
  staticReason: PromotionStaticReason;
}) {
  return itemCount > 1
    && !userPaused
    && !documentHidden
    && staticReason === null;
}
