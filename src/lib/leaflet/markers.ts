/**
 * 云游地图 Marker Design System (基于 Leaflet L.divIcon)
 *
 * 实现了 5 大核心景点的地标图标与常显标牌，文字与图标完全水平端正，
 * 触碰带有轻微涟漪与外边环闪烁特效。
 */

import type { L, LeafletType } from "@/types/leaflet";
import type { MapObject } from "@/lib/map/map-object";
import { MARKER_STYLES } from "@/lib/map/map-object";

// 5 大核心景区专属文化图标与简称配置
const FEATURED_SPOT_GLYPHS: Record<string, { glyph: string; short: string; badge: string }> = {
  "guoen-temple": { glyph: "⛩️", short: "恩", badge: "国恩寺" },
  "huineng-residence": { glyph: "🏡", short: "祖", badge: "六祖故居" },
  "zangfo-valley": { glyph: "⛰️", short: "藏", badge: "藏佛坑" },
  "longshan-spring": { glyph: "♨️", short: "泉", badge: "龙山温泉" },
  "chanyu-town": { glyph: "🏮", short: "禅", badge: "禅域小镇" },
};

export function createMapIcon(leaflet: LeafletType, obj: MapObject, isSelected = false): L.DivIcon {
  const spotKey = obj.sourceId || obj.id.replace(/^scenic-|^concept-/, "");
  const featuredConfig = FEATURED_SPOT_GLYPHS[spotKey] || (obj.type === "scenic_spot" && obj.featured ? FEATURED_SPOT_GLYPHS[obj.id] : null);

  let htmlContent = "";
  let iconSize: [number, number] = [40, 40];
  let iconAnchor: [number, number] = [20, 20];
  const selectedClass = isSelected ? "selected" : "";

  if (featuredConfig) {
    // 5 大核心景区专属图标
    htmlContent = `
      <div class="liuzu-marker-anchor ${selectedClass}" data-id="${obj.id}" data-type="${obj.type}" title="${obj.title}">
        <div class="marker-featured-spot">
          <div class="marker-featured-base"></div>
          <div class="marker-featured-body">
            <span class="marker-featured-glyph">${featuredConfig.glyph}</span>
            <span class="marker-featured-text">${featuredConfig.short}</span>
          </div>
          <div class="marker-spot-label">${featuredConfig.badge}</div>
        </div>
      </div>
    `;
    iconSize = [46, 46];
    iconAnchor = [23, 23];
  } else if (obj.type === "scenic_spot" || obj.type === "culture") {
    // 普通菱形地点
    htmlContent = `
      <div class="liuzu-marker-anchor ${selectedClass}" data-id="${obj.id}" data-type="${obj.type}" title="${obj.title}">
        <div class="marker-normal-diamond">
          <div class="marker-diamond-base"></div>
          <span class="marker-upright-text">${obj.shortLabel}</span>
        </div>
      </div>
    `;
    iconSize = [40, 40];
    iconAnchor = [20, 20];
  } else if (obj.type === "npc" || obj.type === "visitor") {
    // 圆形 NPC / 人物
    htmlContent = `
      <div class="liuzu-marker-anchor ${selectedClass}" data-id="${obj.id}" data-type="${obj.type}" title="${obj.title}">
        <div class="marker-normal-circle">
          <span>${obj.shortLabel}</span>
        </div>
      </div>
    `;
    iconSize = [42, 42];
    iconAnchor = [21, 21];
  } else if (obj.type === "village") {
    // 六边形村落
    htmlContent = `
      <div class="liuzu-marker-anchor ${selectedClass}" data-id="${obj.id}" data-type="${obj.type}" title="${obj.title}">
        <div class="marker-normal-hexagon">
          <span>${obj.shortLabel}</span>
        </div>
      </div>
    `;
    iconSize = [40, 40];
    iconAnchor = [20, 20];
  } else {
    // 方形商户 / 资源
    htmlContent = `
      <div class="liuzu-marker-anchor ${selectedClass}" data-id="${obj.id}" data-type="${obj.type}" title="${obj.title}">
        <div class="marker-normal-square">
          <span>${obj.shortLabel}</span>
        </div>
      </div>
    `;
    iconSize = [40, 40];
    iconAnchor = [20, 20];
  }

  return leaflet.divIcon({
    className: "liuzu-map-marker-container",
    html: htmlContent,
    iconSize,
    iconAnchor,
  });
}

export function createUserLocationIcon(leaflet: LeafletType): L.DivIcon {
  return leaflet.divIcon({
    className: "liuzu-map-marker-container",
    html: `<div class="liuzu-marker-anchor" title="我的当前位置"><div class="marker-user-pin">我</div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
