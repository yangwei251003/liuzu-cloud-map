import { createHash } from "node:crypto";

import type { MapEditorDraft, MapEditorDraftCollection } from "./map-editor-draft";
import type {
  GisFormalizationEntrancePolicy,
  GisFormalizationPathPolicy,
  PrepareGisFormalizationInput,
} from "./gis-formalization-contract";
import { validateRouteNetwork, type RouteNetworkManifest, type RouteNetworkNode } from "./route-network";
import { validateRouteOperationalState, type RouteOperationalState } from "./route-operational-state";

export type GisFormalizationPlanNode = {
  code: string;
  layer: "PUBLIC" | "INTERNAL";
  coordinate: [number, number];
  kind: "ENTRANCE_CONNECTOR" | "JUNCTION" | "DESTINATION" | "FACILITY" | "TRANSIT";
  entranceDraftId: string | null;
  pointDraftId: string | null;
  capturedAt: string;
};

export type GisFormalizationPlanEdge = {
  code: string;
  pathDraftId: string;
  segmentIndex: number;
  layer: "PUBLIC" | "INTERNAL";
  fromNodeCode: string;
  toNodeCode: string;
  walkingDirection: "FORWARD" | "REVERSE" | "BIDIRECTIONAL";
  geometry: { type: "LineString"; coordinates: [[number, number], [number, number]] };
  distanceMeters: number;
  estimatedMinutes: number;
};

export type GisFormalizationPlanRecommendedRoute = {
  draftId: string;
  code: string;
  name: string;
  originNodeCode: string;
  destinationNodeCode: string;
  segments: Array<{ edgeCode: string; traversalDirection: "FORWARD" | "REVERSE" }>;
  traversalModes: Array<NonNullable<MapEditorDraft["routingAttributes"]>["traversalMode"]>;
  distanceMeters: number;
  estimatedMinutes: number;
  sourceReference: string;
};

export type GisFormalizationPlan = {
  schemaVersion: 1;
  scenicAreaId: string;
  submissionId: string;
  submissionRevision: number;
  submissionContentSha256: string;
  reviewedBySubject: string;
  reviewedAt: string;
  preparedBySubject: string;
  preparedAt: string;
  networkRevision: string;
  providerName: string;
  sourceReference: string;
  fieldEvidenceReference: string;
  licenseReference: string;
  rightsHolder: string;
  coordinateAccuracyMeters: number;
  validUntil: string;
  operationalSourceReference: string;
  operationalResponsibleParty: string;
  operationalExpiresAt: string;
  pathPolicies: GisFormalizationPathPolicy[];
  entrancePolicies: GisFormalizationEntrancePolicy[];
  nodes: GisFormalizationPlanNode[];
  edges: GisFormalizationPlanEdge[];
  poiDraftIds: string[];
  facilityDraftIds: string[];
  boundaryDraftId: string;
  recommendedRouteDraftIds: string[];
  recommendedRoutes: GisFormalizationPlanRecommendedRoute[];
  excludedNoteDraftIds: string[];
};

export type GisFormalizationSource = {
  submissionId: string;
  submissionRevision: number;
  submissionContentSha256: string;
  reviewedBySubject: string;
  reviewedAt: string;
  collection: MapEditorDraftCollection;
};

export type GisFormalizationMaterializedIds = {
  poiIdsByDraftId: ReadonlyMap<string, string>;
};

export type GisFormalizationMaterialized = {
  routeNetwork: RouteNetworkManifest;
  operationalState: RouteOperationalState;
  snapshotJson: { schemaVersion: 1; routeNetwork: RouteNetworkManifest; operationalState: RouteOperationalState };
  snapshotSha256: string;
};

type CompileResult = { ok: true; plan: GisFormalizationPlan; planSha256: string } | { ok: false; issues: string[] };
const MAX_STATIC_VALIDITY_MS = 30 * 24 * 60 * 60_000;
const MAX_OPERATIONAL_VALIDITY_MS = 72 * 60 * 60_000;
const MIN_VALIDITY_MS = 30 * 60_000;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_canonical_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("unsupported_canonical_value");
}

export function canonicalizeGisFormalizationPlan(plan: GisFormalizationPlan) {
  return canonicalJson(plan);
}

export function hashGisFormalizationPlan(plan: GisFormalizationPlan) {
  return createHash("sha256").update(canonicalizeGisFormalizationPlan(plan), "utf8").digest("hex");
}

function shortHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function coordinateKey(coordinate: readonly number[]) {
  return `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
}

function roundedCoordinate(coordinate: readonly number[]): [number, number] {
  return [Math.round(coordinate[0] * 1_000_000) / 1_000_000, Math.round(coordinate[1] * 1_000_000) / 1_000_000];
}

function haversineMeters(a: readonly number[], b: readonly number[]) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b[0] - a[0]);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isHttps(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function sourceById(collection: MapEditorDraftCollection) {
  return new Map(collection.drafts.map((draft) => [draft.id, draft]));
}

function planNodeCode(layer: "PUBLIC" | "INTERNAL", key: string) {
  return `n-${layer === "PUBLIC" ? "p" : "i"}-${shortHash(key)}`;
}

function planEdgeCode(layer: "PUBLIC" | "INTERNAL", draftId: string, segmentIndex: number, from: string, to: string) {
  return `e-${layer === "PUBLIC" ? "p" : "i"}-${shortHash(`${draftId}:${segmentIndex}:${from}:${to}`)}`;
}

function latestCapturedAt(drafts: MapEditorDraft[]) {
  return drafts.map((draft) => draft.source.capturedAt).sort().at(-1)!;
}

export function compileGisFormalizationPlan(
  source: GisFormalizationSource,
  input: PrepareGisFormalizationInput,
  preparedBySubject: string,
  now = new Date(),
): CompileResult {
  const issues: string[] = [];
  const nowMs = now.getTime();
  const validUntilMs = new Date(input.validUntil).getTime();
  const operationalExpiresMs = new Date(input.operationalExpiresAt).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(validUntilMs) || !Number.isFinite(operationalExpiresMs)) return { ok: false, issues: ["TIME_INVALID"] };
  if (source.submissionId !== input.submissionId) issues.push("SUBMISSION_MISMATCH");
  if (validUntilMs < nowMs + MIN_VALIDITY_MS || validUntilMs > nowMs + MAX_STATIC_VALIDITY_MS) issues.push("STATIC_VALIDITY_INVALID");
  if (operationalExpiresMs < nowMs + MIN_VALIDITY_MS || operationalExpiresMs > nowMs + MAX_OPERATIONAL_VALIDITY_MS || operationalExpiresMs > validUntilMs) issues.push("OPERATIONAL_VALIDITY_INVALID");
  if (source.reviewedBySubject === preparedBySubject) issues.push("REVIEWER_CANNOT_PREPARE");

  const drafts = sourceById(source.collection);
  const paths = source.collection.drafts.filter((draft) => draft.objectType === "PATH");
  const entrances = source.collection.drafts.filter((draft) => draft.objectType === "ENTRANCE");
  const pois = source.collection.drafts.filter((draft) => draft.objectType === "POI");
  const facilities = source.collection.drafts.filter((draft) => draft.objectType === "FACILITY");
  const boundaries = source.collection.drafts.filter((draft) => draft.objectType === "BOUNDARY");
  const recommendedRoutes = source.collection.drafts.filter((draft) => draft.objectType === "RECOMMENDED_ROUTE");
  const notes = source.collection.drafts.filter((draft) => draft.objectType === "NOTE");
  if (paths.length < 2) issues.push("AT_LEAST_TWO_PATHS_REQUIRED");
  if (!entrances.length) issues.push("ENTRANCE_REQUIRED");
  if (!pois.length) issues.push("POI_REQUIRED");
  if (boundaries.length !== 1) issues.push("EXACTLY_ONE_BOUNDARY_REQUIRED");
  if (source.collection.drafts.filter((draft) => draft.objectType !== "NOTE").some((draft) => !isHttps(draft.source.url))) issues.push("OBJECT_SOURCE_HTTPS_REQUIRED");
  if (source.collection.drafts.some((draft) => new Date(draft.source.capturedAt).getTime() > nowMs)) issues.push("OBJECT_SOURCE_IN_FUTURE");
  for (const path of paths) {
    const transportMode = path.routingAttributes?.traversalMode === "CABLEWAY" || path.routingAttributes?.traversalMode === "SHUTTLE";
    if (transportMode && !path.routingAttributes?.transportService) issues.push(`TRANSPORT_SERVICE_REQUIRED:${path.id}`);
    if (transportMode && (path.geometry.type !== "LineString" || path.geometry.coordinates.length !== 2)) issues.push(`TRANSPORT_PATH_MUST_HAVE_TWO_ENDPOINTS:${path.id}`);
  }

  const pathPolicyById = new Map(input.pathPolicies.map((policy) => [policy.draftId, policy]));
  const entrancePolicyById = new Map(input.entrancePolicies.map((policy) => [policy.draftId, policy]));
  if (pathPolicyById.size !== paths.length || paths.some((path) => !pathPolicyById.has(path.id)) || input.pathPolicies.some((policy) => drafts.get(policy.draftId)?.objectType !== "PATH")) issues.push("PATH_POLICIES_INCOMPLETE");
  if (entrancePolicyById.size !== entrances.length || entrances.some((entrance) => !entrancePolicyById.has(entrance.id)) || input.entrancePolicies.some((policy) => drafts.get(policy.draftId)?.objectType !== "ENTRANCE")) issues.push("ENTRANCE_POLICIES_INCOMPLETE");
  if (!input.pathPolicies.some((policy) => policy.layer === "PUBLIC") || !input.pathPolicies.some((policy) => policy.layer === "INTERNAL")) issues.push("BOTH_LAYERS_REQUIRED");
  if (!input.entrancePolicies.some((policy) => policy.type === "ENTRY" || policy.type === "ENTRY_EXIT")) issues.push("ENTRY_REQUIRED");
  if (issues.length) return { ok: false, issues: [...new Set(issues)] };

  const nodeDraftsByLayerAndKey = new Map<string, Map<string, MapEditorDraft[]>>();
  const ensureLayer = (layer: "PUBLIC" | "INTERNAL") => {
    let layerMap = nodeDraftsByLayerAndKey.get(layer);
    if (!layerMap) { layerMap = new Map(); nodeDraftsByLayerAndKey.set(layer, layerMap); }
    return layerMap;
  };
  for (const path of paths) {
    const policy = pathPolicyById.get(path.id)!;
    const transportMode = path.routingAttributes?.traversalMode === "CABLEWAY" || path.routingAttributes?.traversalMode === "SHUTTLE";
    if (transportMode && (path.geometry.type !== "LineString" || path.geometry.coordinates.length !== 2)) continue;
    const layerMap = ensureLayer(policy.layer);
    for (const coordinate of path.geometry.type === "LineString" ? path.geometry.coordinates : []) {
      const key = coordinateKey(coordinate);
      const related = layerMap.get(key) ?? [];
      related.push(path);
      layerMap.set(key, related);
    }
  }

  const pointAtInternalVertex = (draft: MapEditorDraft) => draft.geometry.type === "Point" && ensureLayer("INTERNAL").has(coordinateKey(draft.geometry.coordinates));
  for (const entrance of entrances) {
    if (entrance.geometry.type !== "Point") continue;
    const key = coordinateKey(entrance.geometry.coordinates);
    if (!ensureLayer("PUBLIC").has(key) || !ensureLayer("INTERNAL").has(key)) issues.push(`ENTRANCE_NOT_EXACT_BOTH_LAYERS:${entrance.id}`);
  }
  for (const point of [...pois, ...facilities]) if (!pointAtInternalVertex(point)) issues.push(`POINT_NOT_EXACT_INTERNAL_VERTEX:${point.id}`);
  const pointIdsByKey = new Map<string, string[]>();
  for (const point of [...pois, ...facilities]) {
    if (point.geometry.type !== "Point") continue;
    const key = coordinateKey(point.geometry.coordinates);
    const ids = pointIdsByKey.get(key) ?? [];
    ids.push(point.id);
    pointIdsByKey.set(key, ids);
  }
  if ([...pointIdsByKey.values()].some((ids) => ids.length > 1)) issues.push("MULTIPLE_POINTS_ON_ONE_ROUTE_VERTEX");
  for (const route of recommendedRoutes) {
    if (route.geometry.type !== "LineString" || route.geometry.coordinates.some((coordinate) => !ensureLayer("INTERNAL").has(coordinateKey(coordinate)))) issues.push(`RECOMMENDED_ROUTE_NOT_ON_INTERNAL_VERTICES:${route.id}`);
  }
  if (issues.length) return { ok: false, issues: [...new Set(issues)] };

  const entranceByKey = new Map(entrances.map((draft) => [coordinateKey((draft.geometry as Extract<MapEditorDraft["geometry"], { type: "Point" }>).coordinates), draft]));
  const pointByKey = new Map([...pois, ...facilities].map((draft) => [coordinateKey((draft.geometry as Extract<MapEditorDraft["geometry"], { type: "Point" }>).coordinates), draft]));
  const nodes: GisFormalizationPlanNode[] = [];
  for (const layer of ["PUBLIC", "INTERNAL"] as const) {
    const layerMap = ensureLayer(layer);
    for (const [key, relatedDrafts] of [...layerMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const coordinate = roundedCoordinate(key.split(",").map(Number));
      const entrance = entranceByKey.get(key) ?? null;
      const point = layer === "INTERNAL" ? pointByKey.get(key) ?? null : null;
      const transit = relatedDrafts.some((draft) => draft.routingAttributes?.traversalMode === "CABLEWAY" || draft.routingAttributes?.traversalMode === "SHUTTLE");
      nodes.push({
        code: planNodeCode(layer, key),
        layer,
        coordinate,
        kind: entrance ? "ENTRANCE_CONNECTOR" : point?.objectType === "POI" ? "DESTINATION" : point?.objectType === "FACILITY" ? "FACILITY" : transit ? "TRANSIT" : "JUNCTION",
        entranceDraftId: entrance?.id ?? null,
        pointDraftId: point?.id ?? null,
        capturedAt: latestCapturedAt([...relatedDrafts, ...(entrance ? [entrance] : []), ...(point ? [point] : [])]),
      });
    }
  }
  const nodeByLayerAndKey = new Map(nodes.map((node) => [`${node.layer}:${coordinateKey(node.coordinate)}`, node]));
  const edges: GisFormalizationPlanEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const path of [...paths].sort((a, b) => a.id.localeCompare(b.id))) {
    if (path.geometry.type !== "LineString" || !path.routingAttributes) continue;
    const policy = pathPolicyById.get(path.id)!;
    for (let index = 0; index < path.geometry.coordinates.length - 1; index += 1) {
      let fromCoordinate = roundedCoordinate(path.geometry.coordinates[index]);
      let toCoordinate = roundedCoordinate(path.geometry.coordinates[index + 1]);
      if (policy.walkingDirection === "REVERSE") [fromCoordinate, toCoordinate] = [toCoordinate, fromCoordinate];
      const distance = haversineMeters(fromCoordinate, toCoordinate);
      if (distance < 0.25) { issues.push(`ZERO_LENGTH_SEGMENT:${path.id}:${index}`); continue; }
      const from = nodeByLayerAndKey.get(`${policy.layer}:${coordinateKey(fromCoordinate)}`)!;
      const to = nodeByLayerAndKey.get(`${policy.layer}:${coordinateKey(toCoordinate)}`)!;
      const duplicateKey = `${policy.layer}:${from.code}:${to.code}:${policy.walkingDirection}`;
      if (edgeKeys.has(duplicateKey)) { issues.push(`DUPLICATE_SEGMENT:${path.id}:${index}`); continue; }
      edgeKeys.add(duplicateKey);
      edges.push({
        code: planEdgeCode(policy.layer, path.id, index, from.code, to.code),
        pathDraftId: path.id,
        segmentIndex: index,
        layer: policy.layer,
        fromNodeCode: from.code,
        toNodeCode: to.code,
        walkingDirection: policy.walkingDirection === "REVERSE" ? "FORWARD" : policy.walkingDirection,
        geometry: { type: "LineString", coordinates: [fromCoordinate, toCoordinate] },
        distanceMeters: Math.round(distance * 100) / 100,
        estimatedMinutes: path.routingAttributes.transportService
          ? Math.round((path.routingAttributes.transportService.boardingMinutes + path.routingAttributes.transportService.expectedWaitMinutes + path.routingAttributes.transportService.inVehicleMinutes) * 100) / 100
          : Math.max(0.01, Math.round((distance / 80 * path.routingAttributes.walkingTimeMultiplier) * 100) / 100),
      });
    }
  }
  const recommendedRoutePlans: GisFormalizationPlanRecommendedRoute[] = [];
  for (const route of [...recommendedRoutes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (route.geometry.type !== "LineString" || !route.source.url) continue;
    const segments: GisFormalizationPlanRecommendedRoute["segments"] = [];
    const traversalModes = new Set<NonNullable<MapEditorDraft["routingAttributes"]>["traversalMode"]>();
    let distanceMeters = 0;
    let estimatedMinutes = 0;
    let valid = true;
    for (let index = 0; index < route.geometry.coordinates.length - 1; index += 1) {
      const fromKey = coordinateKey(route.geometry.coordinates[index]);
      const toKey = coordinateKey(route.geometry.coordinates[index + 1]);
      const candidates: Array<{ edge: GisFormalizationPlanEdge; traversalDirection: "FORWARD" | "REVERSE" }> = [];
      for (const edge of edges) {
        if (edge.layer !== "INTERNAL") continue;
        const edgeFromKey = coordinateKey(edge.geometry.coordinates[0]);
        const edgeToKey = coordinateKey(edge.geometry.coordinates[1]);
        if (edgeFromKey === fromKey && edgeToKey === toKey && (edge.walkingDirection === "FORWARD" || edge.walkingDirection === "BIDIRECTIONAL")) {
          candidates.push({ edge, traversalDirection: "FORWARD" });
        }
        if (edgeFromKey === toKey && edgeToKey === fromKey && (edge.walkingDirection === "REVERSE" || edge.walkingDirection === "BIDIRECTIONAL")) {
          candidates.push({ edge, traversalDirection: "REVERSE" });
        }
      }
      if (candidates.length !== 1 || segments.some((segment) => segment.edgeCode === candidates[0]?.edge.code)) {
        issues.push(`RECOMMENDED_ROUTE_SEGMENT_NOT_UNIQUE:${route.id}:${index}`);
        valid = false;
        break;
      }
      const candidate = candidates[0];
      const path = drafts.get(candidate.edge.pathDraftId);
      if (!path?.routingAttributes) {
        issues.push(`RECOMMENDED_ROUTE_SEGMENT_ATTRIBUTES_MISSING:${route.id}:${index}`);
        valid = false;
        break;
      }
      segments.push({ edgeCode: candidate.edge.code, traversalDirection: candidate.traversalDirection });
      traversalModes.add(path.routingAttributes.traversalMode);
      distanceMeters += candidate.edge.distanceMeters;
      estimatedMinutes += candidate.edge.estimatedMinutes;
    }
    const originNode = nodeByLayerAndKey.get(`INTERNAL:${coordinateKey(route.geometry.coordinates[0])}`);
    const destinationNode = nodeByLayerAndKey.get(`INTERNAL:${coordinateKey(route.geometry.coordinates.at(-1)!)}`);
    if (!originNode || !destinationNode || originNode.code === destinationNode.code) {
      issues.push(`RECOMMENDED_ROUTE_ENDPOINT_INVALID:${route.id}`);
      valid = false;
    }
    if (!valid || !originNode || !destinationNode) continue;
    recommendedRoutePlans.push({
      draftId: route.id,
      code: `recommended-${shortHash(route.id)}`,
      name: route.title,
      originNodeCode: originNode.code,
      destinationNodeCode: destinationNode.code,
      segments,
      traversalModes: [...traversalModes].sort(),
      distanceMeters: Math.round(distanceMeters * 100) / 100,
      estimatedMinutes: Math.round(estimatedMinutes * 100) / 100,
      sourceReference: route.source.url,
    });
  }
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const targets = adjacency.get(from) ?? new Set<string>();
    targets.add(to);
    adjacency.set(from, targets);
  };
  for (const edge of edges) {
    link(edge.fromNodeCode, edge.toNodeCode);
    if (edge.walkingDirection === "BIDIRECTIONAL") link(edge.toNodeCode, edge.fromNodeCode);
  }
  for (const layer of ["PUBLIC", "INTERNAL"] as const) {
    const seeds = nodes.filter((node) => node.layer === layer && node.entranceDraftId !== null).map((node) => node.code);
    const reached = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    const disconnected = nodes.filter((node) => node.layer === layer && !reached.has(node.code));
    if (disconnected.length) issues.push(`DIRECTED_LAYER_DISCONNECTED:${layer}`);
  }
  if (issues.length) return { ok: false, issues: [...new Set(issues)] };
  const networkRevision = `r-${source.submissionRevision}-${shortHash(source.submissionContentSha256)}`;
  const plan: GisFormalizationPlan = {
    schemaVersion: 1,
    scenicAreaId: source.collection.scenicAreaId,
    submissionId: source.submissionId,
    submissionRevision: source.submissionRevision,
    submissionContentSha256: source.submissionContentSha256,
    reviewedBySubject: source.reviewedBySubject,
    reviewedAt: source.reviewedAt,
    preparedBySubject,
    preparedAt: now.toISOString(),
    networkRevision,
    providerName: input.providerName,
    sourceReference: input.sourceReference,
    fieldEvidenceReference: input.fieldEvidenceReference,
    licenseReference: input.licenseReference,
    rightsHolder: input.rightsHolder,
    coordinateAccuracyMeters: input.coordinateAccuracyMeters,
    validUntil: input.validUntil,
    operationalSourceReference: input.operationalSourceReference,
    operationalResponsibleParty: input.operationalResponsibleParty,
    operationalExpiresAt: input.operationalExpiresAt,
    pathPolicies: [...input.pathPolicies].sort((a, b) => a.draftId.localeCompare(b.draftId)),
    entrancePolicies: [...input.entrancePolicies].sort((a, b) => a.draftId.localeCompare(b.draftId)),
    nodes,
    edges,
    poiDraftIds: pois.map((draft) => draft.id).sort(),
    facilityDraftIds: facilities.map((draft) => draft.id).sort(),
    boundaryDraftId: boundaries[0].id,
    recommendedRouteDraftIds: recommendedRoutes.map((draft) => draft.id).sort(),
    recommendedRoutes: recommendedRoutePlans,
    excludedNoteDraftIds: notes.map((draft) => draft.id).sort(),
  };
  return { ok: true, plan, planSha256: hashGisFormalizationPlan(plan) };
}

function mapAccessibility(value: NonNullable<MapEditorDraft["routingAttributes"]>["accessibility"]) {
  if (value === "PARTIAL") return "VERIFIED_PARTIAL" as const;
  if (value === "NOT_ACCESSIBLE") return "VERIFIED_NOT_ACCESSIBLE" as const;
  return value;
}

export function materializeGisFormalization(
  plan: GisFormalizationPlan,
  collection: MapEditorDraftCollection,
  ids: GisFormalizationMaterializedIds,
  managementApprover: string,
  managementEvidenceReference: string,
  publishedAt: Date,
): { ok: true; value: GisFormalizationMaterialized } | { ok: false; issues: string[] } {
  const draftById = sourceById(collection);
  const entranceId = (draftId: string) => `entrance-${shortHash(draftId)}`;
  const entranceNode = (draftId: string, layer: "PUBLIC" | "INTERNAL") => plan.nodes.find((node) => node.entranceDraftId === draftId && node.layer === layer)!;
  const entrances = plan.entrancePolicies.map((policy) => {
    const draft = draftById.get(policy.draftId)!;
    const coordinate = (draft.geometry as Extract<MapEditorDraft["geometry"], { type: "Point" }>).coordinates;
    return {
      id: entranceId(draft.id), name: draft.title, type: policy.type,
      coordinate: { longitude: coordinate[0], latitude: coordinate[1], coordinateSystem: "WGS84" as const, accuracyMeters: plan.coordinateAccuracyMeters, capturedAt: draft.source.capturedAt, sourceReference: draft.source.url! },
      verification: { status: "MANAGEMENT_APPROVED" as const, checkedAt: plan.preparedAt, expiresAt: plan.validUntil, verifier: plan.reviewedBySubject, managementApprover, evidenceReference: managementEvidenceReference },
      publicNodeId: entranceNode(draft.id, "PUBLIC").code,
      internalNodeId: entranceNode(draft.id, "INTERNAL").code,
    };
  });
  const nodes: RouteNetworkNode[] = plan.nodes.map((node) => {
    const point = node.pointDraftId ? draftById.get(node.pointDraftId)! : null;
    const entranceDraft = node.entranceDraftId ? draftById.get(node.entranceDraftId)! : null;
    const visit = point?.visitAttributes ? {
      interestTags: point.visitAttributes.interests,
      dwellMinutes: point.visitAttributes.dwellMinutes,
      editorialPriority: point.visitAttributes.editorialPriority,
      familyFriendly: point.visitAttributes.familyFriendly,
      restArea: point.visitAttributes.restArea,
      photoSpot: point.visitAttributes.photoSpot,
      evidenceReference: point.source.url!,
    } : undefined;
    return {
      id: node.code,
      layer: node.layer,
      type: node.kind,
      entranceId: node.entranceDraftId ? entranceId(node.entranceDraftId) : null,
      coordinate: { longitude: node.coordinate[0], latitude: node.coordinate[1], coordinateSystem: "WGS84", accuracyMeters: plan.coordinateAccuracyMeters, capturedAt: node.capturedAt, sourceReference: entranceDraft?.source.url ?? point?.source.url ?? plan.fieldEvidenceReference },
      ...(point ? { displayName: point.title, poiId: point.objectType === "POI" ? ids.poiIdsByDraftId.get(point.id) ?? null : null, visit } : {}),
    };
  });
  const edges = plan.edges.map((edge) => {
    const draft = draftById.get(edge.pathDraftId)!;
    const attrs = draft.routingAttributes!;
    const accessibility = mapAccessibility(attrs.accessibility);
    return {
      id: edge.code,
      layer: edge.layer,
      fromNodeId: edge.fromNodeCode,
      toNodeId: edge.toNodeCode,
      walkingDirection: edge.walkingDirection,
      geometry: edge.geometry,
      distanceMeters: edge.distanceMeters,
      estimatedMinutes: edge.estimatedMinutes,
      verificationStatus: "MANAGEMENT_APPROVED" as const,
      accessibility: accessibility === "UNKNOWN"
        ? { status: "UNKNOWN" as const, checkedAt: null, expiresAt: null, evidenceReference: null }
        : { status: accessibility, checkedAt: plan.preparedAt, expiresAt: plan.validUntil, evidenceReference: draft.source.url! },
      constraints: {
        stairs: attrs.traversalMode === "STAIRS"
          ? "PRESENT" as const
          : attrs.transportService && attrs.accessibility === "VERIFIED_ACCESSIBLE" ? "NONE" as const : "UNKNOWN" as const,
        surface: "UNKNOWN" as const,
        maxSlopePercent: null,
        minWidthMeters: null,
        lighting: "UNKNOWN" as const,
        notes: [],
      },
      dynamicStatus: { status: "OPEN" as const, checkedAt: publishedAt.toISOString(), expiresAt: plan.operationalExpiresAt, sourceReference: plan.operationalSourceReference, responsibleParty: plan.operationalResponsibleParty },
      routing: {
        traversalMode: attrs.traversalMode,
        difficulty: attrs.difficulty,
        scenicScore: attrs.scenicScore,
        evidenceReference: draft.source.url!,
        ...(attrs.transportService ? { transportService: structuredClone(attrs.transportService) } : {}),
      },
    };
  });
  const routeNetwork: RouteNetworkManifest = {
    schemaVersion: 1,
    scenicAreaId: plan.scenicAreaId,
    revision: plan.networkRevision,
    publicationStatus: "PUBLISHED",
    publishedAt: publishedAt.toISOString(),
    withdrawnAt: null,
    expiresAt: plan.validUntil,
    coordinateSystem: "WGS84",
    source: { sourceId: `source-${shortHash(plan.sourceReference)}`, category: "AUTHORIZED_FIELD_SURVEY", provider: plan.providerName, acquiredAt: plan.preparedAt, evidenceReference: plan.fieldEvidenceReference },
    rights: { status: "CLEARED", rightsHolder: plan.rightsHolder, licenseReference: plan.licenseReference, validUntil: plan.validUntil, allowsDisplay: true, allowsRouting: true, allowsCaching: true, allowsDerivatives: true },
    review: { status: "APPROVED", reviewedRevision: plan.networkRevision, gisReviewer: plan.reviewedBySubject, managementApprover, reviewedAt: publishedAt.toISOString(), expiresAt: plan.validUntil, evidenceReference: managementEvidenceReference },
    entrances,
    nodes,
    edges,
    recommendedRoutes: plan.recommendedRoutes.map((route) => ({
      id: route.code,
      name: route.name,
      originNodeId: route.originNodeCode,
      destinationNodeId: route.destinationNodeCode,
      segments: route.segments.map((segment) => ({ edgeId: segment.edgeCode, traversalDirection: segment.traversalDirection })),
      traversalModes: [...route.traversalModes],
      distanceMeters: route.distanceMeters,
      estimatedMinutes: route.estimatedMinutes,
      sourceReference: route.sourceReference,
    })),
  };
  const operationalState: RouteOperationalState = {
    schemaVersion: 1,
    scenicAreaId: plan.scenicAreaId,
    networkRevision: plan.networkRevision,
    operationalVersion: 1,
    issuedAt: publishedAt.toISOString(),
    expiresAt: plan.operationalExpiresAt,
    sourceReference: plan.operationalSourceReference,
    responsibleParty: plan.operationalResponsibleParty,
    edgeStates: edges.map((edge) => ({ edgeId: edge.id, status: "OPEN", checkedAt: publishedAt.toISOString(), expiresAt: plan.operationalExpiresAt, sourceReference: plan.operationalSourceReference, responsibleParty: plan.operationalResponsibleParty, routing: { travelTimeMultiplier: 1, crowdLevel: "UNKNOWN", weatherImpact: "UNKNOWN" } })),
  };
  const networkValidation = validateRouteNetwork(routeNetwork, publishedAt, plan.scenicAreaId);
  const operationalValidation = validateRouteOperationalState(operationalState, routeNetwork, publishedAt, plan.scenicAreaId);
  const issues = [...networkValidation.issues.map((issue) => `NETWORK:${issue.code}:${issue.path}`), ...operationalValidation.issues.map((issue) => `OPERATIONAL:${issue.code}:${issue.path}`)];
  if (issues.length) return { ok: false, issues };
  const snapshotJson = { schemaVersion: 1 as const, routeNetwork, operationalState };
  const snapshotSha256 = createHash("sha256").update(canonicalJson(snapshotJson), "utf8").digest("hex");
  return { ok: true, value: { routeNetwork, operationalState, snapshotJson, snapshotSha256 } };
}
