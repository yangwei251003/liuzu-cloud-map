import type * as MapLibre from "maplibre-gl";
import { Protocol } from "pmtiles";

let protocol: Protocol | null = null;
let consumerCount = 0;

export function acquirePmtilesProtocol(maplibregl: typeof MapLibre) {
  if (!protocol) {
    protocol = new Protocol({ metadata: true, errorOnMissingTile: false });
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  consumerCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    consumerCount = Math.max(0, consumerCount - 1);
    if (consumerCount === 0 && protocol) {
      maplibregl.removeProtocol("pmtiles");
      protocol = null;
    }
  };
}
