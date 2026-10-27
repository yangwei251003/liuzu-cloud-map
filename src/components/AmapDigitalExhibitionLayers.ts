"use client";

import type { AmapMap, LocaContainer, LocaLayer, LocaNamespace } from "@/lib/amap-types";
import {
  createExhibitionLinkSource,
  createExhibitionPointSource,
  type DigitalExhibitionLayerState,
} from "@/lib/amap-digital-exhibition";

export type AmapDigitalExhibitionBundle = {
  destroy: () => void;
};

type CreateAmapDigitalExhibitionLayersOptions = {
  map: AmapMap;
  locaApi: LocaNamespace;
  layers: DigitalExhibitionLayerState;
  reducedMotion: boolean;
};

function destroyLoca(container: LocaContainer, layers: readonly LocaLayer[]) {
  layers.forEach((layer) => {
    try {
      container.remove?.(layer);
      layer.destroy?.();
    } catch {
      // Individual visual layers are optional. Never let their teardown affect
      // the factual AMap base surface or a future navigation map.
    }
  });
  try {
    container.animate.stop?.();
    container.animate.clear?.();
    container.clear?.();
    container.destroy?.();
  } catch {
    // See above: the AMap instance owns the factual provider lifecycle.
  }
}

/**
 * The Loca bundle is deliberately sparse and source-bound. It renders only
 * visual demonstration points and relationship links from existing candidate
 * coordinates. Route, zone, history and visitor-count layers stay absent
 * until the scenic area supplies verified geometry or operational data.
 */
export function createAmapDigitalExhibitionLayers({ map, locaApi, layers, reducedMotion }: CreateAmapDigitalExhibitionLayersOptions): AmapDigitalExhibitionBundle | null {
  // Candidate point markers are inexpensive native AMap DOM markers. Keep
  // Loca truly on-demand for the higher-cost WebGL visual treatments.
  const shouldRenderLoca = layers["culture-links"] || layers["heat-demo"];
  if (!shouldRenderLoca) return null;

  const container = new locaApi.Container({ map });
  const added: LocaLayer[] = [];
  const add = (layer: LocaLayer) => {
    container.add(layer);
    added.push(layer);
  };

  try {
    const pointSource = new locaApi.GeoJSONSource(createExhibitionPointSource());

    if (layers["heat-demo"]) {
      const heatDemo = new locaApi.PointLayer({
        zIndex: 92,
        opacity: reducedMotion ? 0.24 : 0.34,
        visible: true,
        blend: "lighter",
        zooms: [10, 22],
      });
      heatDemo.setSource(pointSource);
      heatDemo.setStyle({
        radius: (index: number) => 42 + (index % 3) * 11,
        color: (index: number) => ["rgba(255, 193, 80, .50)", "rgba(251, 111, 67, .50)", "rgba(190, 64, 92, .46)"][index % 3],
        borderWidth: 0,
        blurRadius: 0.92,
        unit: "px",
      });
      add(heatDemo);
    }

    if (layers["ordinary-bubbles"]) {
      const bubbles = new locaApi.PointLayer({
        zIndex: 108,
        opacity: 0.88,
        visible: true,
        blend: "lighter",
        zooms: [10, 22],
      });
      bubbles.setSource(pointSource);
      bubbles.setStyle({
        radius: (index: number) => 8 + (index % 3) * 3,
        color: "rgba(87, 226, 186, .58)",
        borderWidth: 1,
        borderColor: "rgba(255, 249, 220, .92)",
        unit: "px",
      });
      add(bubbles);
    }

    if (layers["culture-links"]) {
      const relationshipLinks = new locaApi.LinkLayer({
        zIndex: 102,
        opacity: reducedMotion ? 0.46 : 0.78,
        visible: true,
        zooms: [10, 22],
      });
      relationshipLinks.setSource(new locaApi.GeoJSONSource(createExhibitionLinkSource()));
      relationshipLinks.setStyle({
        lineColors: (index: number) => index % 2 === 0
          ? ["rgba(255, 210, 102, .94)", "rgba(82, 230, 194, .20)"]
          : ["rgba(101, 210, 255, .94)", "rgba(101, 210, 255, .16)"],
        height: (index: number) => 120 + index * 36,
        smoothSteps: () => 80,
      });
      add(relationshipLinks);
    }

    // Loca's own animation clock avoids one requestAnimationFrame loop per
    // line or point. There are no unbounded data-driven animations here.
    if (!reducedMotion) container.animate.start();
  } catch (error) {
    destroyLoca(container, added);
    throw error;
  }

  return { destroy: () => destroyLoca(container, added) };
}
