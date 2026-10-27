import type { MapThemeId } from "@/lib/map-experience";

/**
 * `amap-original` is the standard map. The stable identifier is retained so
 * existing saved UI preferences do not turn into an unrecognised map mode.
 *
 * The wider union deliberately remains available for local visual research,
 * but it is not a public/release-candidate capability. Callers must opt into
 * it with `demoOnlyModesEnabled`; otherwise unknown or experimental modes are
 * resolved to the standard map.
 */
export type AmapPresentationModeId =
  | "amap-original"
  | "green-water"
  | "zen"
  | "retro"
  | "three-d"
  | "fly-lines"
  | "heat"
  | "scatter"
  | "ripple";

export type ReleaseAmapPresentationModeId =
  | "amap-original"
  | "zen"
  | "green-water"
  | "retro"
  | "three-d";
export type AmapDemoPresentationModeId = Exclude<AmapPresentationModeId, ReleaseAmapPresentationModeId>;
export type AmapOverlayKind = "pins" | "fly-lines" | "heat" | "scatter" | "ripple";
export type AmapArtBlendMode = "normal" | "multiply" | "screen" | "soft-light" | "overlay";

export type AmapPresentationMode = {
  id: AmapPresentationModeId;
  name: string;
  shortDescription: string;
  disclosure: string;
  mapStyle: `amap://styles/${string}`;
  pitch: number;
  rotation: number;
  zoom: number;
  overlay: AmapOverlayKind;
  accent: string;
  /**
   * Optional original art direction layered above the factual provider map.
   * It is pointer-inert and deliberately translucent, so it cannot replace,
   * move or hide the provider's roads, POIs and labels. A missing file simply
   * leaves the factual map visible.
   */
  artAssetPath: `/assets/map-skins/${string}` | null;
  artOpacity: number;
  artBlendMode: AmapArtBlendMode;
  artPosition: string;
  fallbackTheme: MapThemeId;
  availability: "RELEASE" | "DEMO_ONLY";
  /** Every visitor skin is a visual treatment of the same factual map. */
  dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY";
};

const ALL_AMAP_PRESENTATION_MODES: readonly AmapPresentationMode[] = [
  {
    id: "amap-original",
    name: "标准地图",
    shortDescription: "标准详细底图",
    disclosure: "适合找路和查看街道、道路、建筑、地点与服务设施；使用高德完整公开地图信息。",
    mapStyle: "amap://styles/normal",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "pins",
    accent: "#17624f",
    artAssetPath: null,
    artOpacity: 0,
    artBlendMode: "normal",
    artPosition: "center",
    fallbackTheme: "standard",
    availability: "RELEASE",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "zen",
    name: "禅意皮肤",
    shortDescription: "文化漫游，完整保留地图信息",
    disclosure: "适合文化漫游；灰白水墨底图配合淡水墨边饰，高德街道、道路、建筑、地点与图标完整保留。",
    mapStyle: "amap://styles/whitesmoke",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "pins",
    accent: "#5e745b",
    artAssetPath: "/assets/map-skins/v4/zen-ink-atlas-v1.webp",
    artOpacity: 0.08,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "zen",
    availability: "RELEASE",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "green-water",
    name: "青山绿水",
    shortDescription: "山水游览，突出自然环境",
    disclosure: "适合山水与生态游览；青绿山水底图配合淡青绿边饰，高德街道、道路、建筑、地点与图标完整保留。",
    mapStyle: "amap://styles/fresh",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "pins",
    accent: "#2f7d4a",
    artAssetPath: "/assets/map-skins/v4/green-water-atlas-v1.webp",
    artOpacity: 0.08,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "lingnan",
    availability: "RELEASE",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "retro",
    name: "复古国风",
    shortDescription: "暖宣纸与黛绿鎏金边饰",
    disclosure: "适合古迹与文化路线；使用浅色古典底图，街道、道路、建筑、地点、图标与真实坐标完整保留。",
    mapStyle: "amap://styles/light",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "pins",
    accent: "#d2ad64",
    artAssetPath: "/assets/map-skins/v4/retro-indigo-atlas-v1.webp",
    artOpacity: 0.12,
    artBlendMode: "normal",
    artPosition: "center",
    fallbackTheme: "standard",
    availability: "RELEASE",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "three-d",
    name: "3D 立体",
    shortDescription: "空间辨向，查看建筑与地形关系",
    disclosure: "适合观察建筑和空间关系；高德街道、道路、建筑、地点与图标完整保留，真实坐标不变。",
    mapStyle: "amap://styles/normal",
    pitch: 56,
    rotation: 12,
    zoom: 15.2,
    overlay: "pins",
    accent: "#2f7b55",
    artAssetPath: "/assets/map-skins/v4/three-d-isometric-atlas-v1.webp",
    artOpacity: 0.08,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "standard",
    availability: "RELEASE",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "fly-lines",
    name: "飞线",
    shortDescription: "节点关系连线",
    disclosure: "艺术示意底纹不对应真实地形；飞线是候选点视觉关系线，不是可走路线或导航。",
    mapStyle: "amap://styles/darkblue",
    pitch: 34,
    rotation: 0,
    zoom: 13.2,
    overlay: "fly-lines",
    accent: "#64d7ff",
    artAssetPath: "/assets/map-skins/v4/retro-indigo-atlas-v1.webp",
    artOpacity: 0.72,
    artBlendMode: "normal",
    artPosition: "center",
    fallbackTheme: "night",
    availability: "DEMO_ONLY",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "heat",
    name: "热力",
    shortDescription: "等权视觉热区",
    disclosure: "艺术示意底纹不对应真实地形；热力是等权视觉圆，不含真实客流或热度数据。",
    mapStyle: "amap://styles/fresh",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "heat",
    accent: "#e56a3b",
    artAssetPath: "/assets/map-skins/v4/green-water-atlas-v1.webp",
    artOpacity: 0.12,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "lingnan",
    availability: "DEMO_ONLY",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "scatter",
    name: "散点",
    shortDescription: "候选节点分布",
    disclosure: "艺术示意底纹不对应真实地形；散点仅作候选点视觉，不代表人群、事件或状态。",
    mapStyle: "amap://styles/light",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "scatter",
    accent: "#596fa8",
    artAssetPath: "/assets/map-skins/v4/zen-ink-atlas-v1.webp",
    artOpacity: 0.14,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "standard",
    availability: "DEMO_ONLY",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
  {
    id: "ripple",
    name: "波纹标记",
    shortDescription: "候选点柔和聚焦",
    disclosure: "艺术示意底纹不对应真实地形；波纹仅作候选点视觉，不代表人群、事件或状态。",
    mapStyle: "amap://styles/normal",
    pitch: 0,
    rotation: 0,
    zoom: 13.4,
    overlay: "ripple",
    accent: "#c14e55",
    artAssetPath: "/assets/map-skins/v4/green-water-atlas-v1.webp",
    artOpacity: 0.12,
    artBlendMode: "multiply",
    artPosition: "center",
    fallbackTheme: "standard",
    availability: "DEMO_ONLY",
    dataContract: "SHARED_SNAPSHOT_COORDINATES_AND_TOPOLOGY",
  },
] as const;

/** Modes with a clear visitor task: orientation, culture, nature, heritage or spatial reading. */
export const AMAP_PRESENTATION_MODES = ALL_AMAP_PRESENTATION_MODES.filter(
  (mode): mode is AmapPresentationMode & { id: ReleaseAmapPresentationModeId } => mode.availability === "RELEASE",
);
export const AMAP_PRESENTATION_MODE_IDS = AMAP_PRESENTATION_MODES.map(({ id }) => id);

/**
 * Visual experiments stay available only to an explicitly flagged local demo.
 * Never use this list for a visitor-facing release candidate.
 */
export const AMAP_DEMO_ONLY_PRESENTATION_MODES = ALL_AMAP_PRESENTATION_MODES.filter(
  (mode): mode is AmapPresentationMode & { id: AmapDemoPresentationModeId } => mode.availability === "DEMO_ONLY",
);

const modeById = new Map(ALL_AMAP_PRESENTATION_MODES.map((mode) => [mode.id, mode]));
const resolvedStandardMode = modeById.get("amap-original");

if (!resolvedStandardMode) throw new Error("missing_standard_amap_presentation_mode");

// Keep the runtime guard above, then retain a non-optional value for every
// consumer. All unknown/experimental selections resolve to this safe base map.
const standardMode: AmapPresentationMode = resolvedStandardMode;

export function getAmapPresentationMode(id: AmapPresentationModeId) {
  return modeById.get(id) ?? standardMode;
}

/**
 * Resolves user-facing modes. The default intentionally rejects any visual
 * experiment so an old local preference cannot re-enable it after promotion.
 */
export function getReleaseSafeAmapPresentationMode(
  id: AmapPresentationModeId | string | undefined,
  demoOnlyModesEnabled = false,
) {
  const mode = typeof id === "string" ? modeById.get(id as AmapPresentationModeId) : undefined;
  if (!mode) return standardMode;
  if (mode.availability === "DEMO_ONLY" && !demoOnlyModesEnabled) return standardMode;
  return mode;
}

export function getAmapPresentationModes(demoOnlyModesEnabled = false) {
  return demoOnlyModesEnabled
    ? [...ALL_AMAP_PRESENTATION_MODES]
    : [...AMAP_PRESENTATION_MODES];
}

export function getAmapFeatures(visibility: { roads: boolean; buildings: boolean; places: boolean; facilities: boolean }) {
  const features: Array<"bg" | "point" | "road" | "building"> = ["bg"];
  if (visibility.places || visibility.facilities) features.push("point");
  if (visibility.roads) features.push("road");
  if (visibility.buildings) features.push("building");
  return features;
}

export function getAmapOverlayPlan(id: AmapPresentationModeId, reducedMotion: boolean) {
  const mode = getAmapPresentationMode(id);
  return {
    kind: mode.overlay,
    animate: mode.overlay === "ripple" && !reducedMotion,
    factualGeometry: mode.overlay === "pins" || mode.overlay === "scatter" || mode.overlay === "ripple",
    navigationCapable: false,
  } as const;
}
