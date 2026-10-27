import type { AmapCoordinate, LocaGeoJsonSourceOptions } from "@/lib/amap-types";
import { scenicSpots } from "@/lib/scenic-data";

/**
 * Exhibition controls are intentionally independent from the base-map skin.
 * A skin changes the way the same factual AMap surface is presented; an
 * exhibition layer is an optional, clearly disclosed visual interpretation.
 */
export const DIGITAL_EXHIBITION_LAYER_IDS = [
  "core-ripples",
  "ordinary-bubbles",
  "culture-links",
  "route-flow",
  "theme-zones",
  "heat-demo",
  "story-replay",
  "comparison-columns",
  "ambient-particles",
] as const;

export type DigitalExhibitionLayerId = typeof DIGITAL_EXHIBITION_LAYER_IDS[number];
export type DigitalExhibitionLayerState = Record<DigitalExhibitionLayerId, boolean>;
export type DigitalExhibitionDataState = "CANDIDATE_POINT" | "VISUAL_DEMO" | "WAITING_FOR_VERIFIED_DATA" | "DECORATIVE";

export type DigitalExhibitionLayerDefinition = {
  id: DigitalExhibitionLayerId;
  label: string;
  legendLabel: string;
  visitorMeaning: string;
  dataState: DigitalExhibitionDataState;
  /** Traceability required before any visual can be presented as factual. */
  source: string;
  license: string;
  capturedAt: string;
  verification: string;
  enabledByDefault: boolean;
  /** A false value prevents a made-up route, boundary or history from rendering. */
  renderableNow: boolean;
};

const CANDIDATE_POINT_METADATA = {
  source: "项目内已登记候选点目录（scenic-data）",
  license: "项目原型资料；不构成官方地图、线路或运营数据",
  capturedAt: "2026-08-17",
  verification: "候选点位·未经现场核验",
} as const;

const WAITING_FOR_SCENIC_DATA_METADATA = {
  source: "待景区提供并核验",
  license: "未接入，不渲染",
  capturedAt: "2026-08-17",
  verification: "资料待接入",
} as const;

const DECORATIVE_METADATA = {
  source: "前端程序化微光装饰",
  license: "项目代码资产",
  capturedAt: "2026-08-17",
  verification: "不承载业务或地理信息",
} as const;

export const DIGITAL_EXHIBITION_LAYERS: readonly DigitalExhibitionLayerDefinition[] = [
  {
    id: "core-ripples",
    label: "核心景点波纹",
    legendLabel: "波纹标记",
    visitorMeaning: "展陈重点候选点；点击查看地点资料。",
    dataState: "CANDIDATE_POINT",
    ...CANDIDATE_POINT_METADATA,
    enabledByDefault: true,
    renderableNow: true,
  },
  {
    id: "ordinary-bubbles",
    label: "普通景点气泡",
    legendLabel: "呼吸气泡",
    visitorMeaning: "普通候选点；气泡大小只用于展示层次，不代表实时热度。",
    dataState: "VISUAL_DEMO",
    ...CANDIDATE_POINT_METADATA,
    enabledByDefault: true,
    renderableNow: true,
  },
  {
    id: "culture-links",
    label: "文化关联飞线",
    legendLabel: "流动飞线",
    visitorMeaning: "地点间的讲解关联示意，不是可行走路线或历史事实。",
    dataState: "VISUAL_DEMO",
    ...CANDIDATE_POINT_METADATA,
    enabledByDefault: false,
    renderableNow: true,
  },
  {
    id: "route-flow",
    label: "推荐游线流光",
    legendLabel: "流光路线",
    visitorMeaning: "需要景区核验后的推荐游线几何；当前不渲染。",
    dataState: "WAITING_FOR_VERIFIED_DATA",
    ...WAITING_FOR_SCENIC_DATA_METADATA,
    enabledByDefault: false,
    renderableNow: false,
  },
  {
    id: "theme-zones",
    label: "主题功能片区",
    legendLabel: "功能片区",
    visitorMeaning: "需要景区提供并核验主题片区边界；当前不渲染。",
    dataState: "WAITING_FOR_VERIFIED_DATA",
    ...WAITING_FOR_SCENIC_DATA_METADATA,
    enabledByDefault: false,
    renderableNow: false,
  },
  {
    id: "heat-demo",
    label: "热力颜色演示",
    legendLabel: "热力颜色",
    visitorMeaning: "只展示色彩表达能力，不代表实时客流、打卡量或开放状态。",
    dataState: "VISUAL_DEMO",
    ...CANDIDATE_POINT_METADATA,
    enabledByDefault: false,
    renderableNow: true,
  },
  {
    id: "story-replay",
    label: "故事轨迹回放",
    legendLabel: "轨迹回放",
    visitorMeaning: "需要带来源的历史行程资料与审核讲解；当前不渲染。",
    dataState: "WAITING_FOR_VERIFIED_DATA",
    ...WAITING_FOR_SCENIC_DATA_METADATA,
    enabledByDefault: false,
    renderableNow: false,
  },
  {
    id: "comparison-columns",
    label: "3D 数据光柱",
    legendLabel: "数据光柱",
    visitorMeaning: "需要景区提供的实时或已审核统计；当前不渲染数值光柱。",
    dataState: "WAITING_FOR_VERIFIED_DATA",
    ...WAITING_FOR_SCENIC_DATA_METADATA,
    enabledByDefault: false,
    renderableNow: false,
  },
  {
    id: "ambient-particles",
    label: "氛围微光粒子",
    legendLabel: "漂浮粒子",
    visitorMeaning: "纯氛围装饰，不承载地点、路线或运营信息。",
    dataState: "DECORATIVE",
    ...DECORATIVE_METADATA,
    enabledByDefault: false,
    renderableNow: true,
  },
] as const;

export const DEFAULT_DIGITAL_EXHIBITION_LAYERS: DigitalExhibitionLayerState = Object.fromEntries(
  DIGITAL_EXHIBITION_LAYERS.map((layer) => [layer.id, layer.enabledByDefault]),
) as DigitalExhibitionLayerState;

export const DIGITAL_EXHIBITION_DISCLOSURE = "当前为颜色与动效演示，不代表实时客流、官方路线、主题片区、历史轨迹或开放状态；接入景区实时与核验数据后，将补充真实场景地图开发。";

export function getDigitalExhibitionLayer(id: DigitalExhibitionLayerId) {
  const layer = DIGITAL_EXHIBITION_LAYERS.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`unknown_digital_exhibition_layer:${id}`);
  return layer;
}

function toPointFeature(coordinate: AmapCoordinate, properties: Record<string, unknown>): LocaGeoJsonSourceOptions["data"]["features"][number] {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: coordinate },
  };
}

/**
 * These sources deliberately use only the already-registered candidate point
 * coordinates. Any styling properties are labelled visual demonstration data,
 * not visitor counts, heat, route geometry or historical claims.
 */
export function createExhibitionPointSource(): LocaGeoJsonSourceOptions {
  return {
    data: {
      type: "FeatureCollection",
      features: scenicSpots.map((spot, index) => toPointFeature(spot.originalGcj02, {
        candidatePointId: spot.id,
        displayTier: index < 2 ? "EXHIBITION_FOCUS" : "EXHIBITION_STANDARD",
        displayWeight: 1,
        dataState: "VISUAL_DEMO",
      })),
    },
  };
}

/**
 * A graphic relationship line is intentionally not a road or path: it joins
 * registered point coordinates only to demonstrate a storytelling treatment.
 */
export function createExhibitionLinkSource(): LocaGeoJsonSourceOptions {
  const pairs = scenicSpots.slice(1).map((spot, index) => [scenicSpots[index], spot] as const);
  return {
    data: {
      type: "FeatureCollection",
      features: pairs.map(([from, to], index) => ({
        type: "Feature" as const,
        properties: {
          displayKind: "CULTURAL_RELATIONSHIP_VISUAL_DEMO",
          sequence: index + 1,
          dataState: "VISUAL_DEMO",
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [from.originalGcj02, to.originalGcj02],
        },
      })),
    },
  };
}
