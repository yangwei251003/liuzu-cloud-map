export const FORMAL_LOCATION_MAX_ACCURACY_METERS = 50;
export const FORMAL_LOCATION_MAX_NODE_ENVELOPE_METERS = 80;

export type FormalLocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type FormalLocationNode = {
  id: string;
  coordinate: { latitude: number; longitude: number };
};

export type FormalLocationMatchResult =
  | { ok: true; nodeId: string; nodeDistanceMeters: number; accuracyMeters: number }
  | { ok: false; code: "INVALID_SAMPLE" | "LOW_ACCURACY" | "NO_FORMAL_NODE_NEARBY" };

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}
export function formalLocationDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const firstLatitude = radians(from.latitude);
  const secondLatitude = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Matches one ephemeral WGS84 browser fix to a node from an already validated
 * formal snapshot. The conservative envelope includes the browser's reported
 * uncertainty; this function never snaps to prototype geometry or stores the
 * precise sample.
 */
export function matchLocationToFormalNode(
  sample: FormalLocationSample,
  nodes: FormalLocationNode[],
): FormalLocationMatchResult {
  if (
    !validCoordinate(sample.latitude, sample.longitude)
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters <= 0
  ) {
    return { ok: false, code: "INVALID_SAMPLE" };
  }
  if (sample.accuracyMeters > FORMAL_LOCATION_MAX_ACCURACY_METERS) {
    return { ok: false, code: "LOW_ACCURACY" };
  }

  const nearest = nodes
    .filter((node) => typeof node.id === "string" && node.id.length > 0 && validCoordinate(node.coordinate.latitude, node.coordinate.longitude))
    .map((node) => ({
      node,
      distance: formalLocationDistanceMeters(sample, node.coordinate),
    }))
    .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))[0];

  if (!nearest || nearest.distance + sample.accuracyMeters > FORMAL_LOCATION_MAX_NODE_ENVELOPE_METERS) {
    return { ok: false, code: "NO_FORMAL_NODE_NEARBY" };
  }
  return {
    ok: true,
    nodeId: nearest.node.id,
    nodeDistanceMeters: nearest.distance,
    accuracyMeters: sample.accuracyMeters,
  };
}
