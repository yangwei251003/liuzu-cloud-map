import {
  normalizePublishedPlaceName,
  validatePublishedPoiCatalog,
} from "./domain";
import type {
  ExtractedItineraryDraftStop,
  PoiMatchConfidence,
  PublishedPoiCatalog,
  PublishedPoiCatalogPoi,
  PublishedPoiCatalogRepository,
  ResolveStructuredItineraryResult,
  StructuredItineraryExtraction,
  StructuredItineraryExtractionRequest,
  StructuredItineraryStop,
  StructuredItineraryUnresolvedIssue,
  UnresolvedItineraryLocation,
} from "./types";

type PoiMatch = {
  poi: PublishedPoiCatalogPoi;
  confidence: PoiMatchConfidence;
} | null;

function exactMatch(rawPlaceName: string, catalog: PublishedPoiCatalog): PoiMatch | "AMBIGUOUS" {
  const normalized = normalizePublishedPlaceName(rawPlaceName);
  if (!normalized) return null;

  const canonicalMatches = catalog.pois.filter((poi) => normalizePublishedPlaceName(poi.canonicalName) === normalized);
  if (canonicalMatches.length > 1) return "AMBIGUOUS";
  if (canonicalMatches.length === 1) return { poi: canonicalMatches[0], confidence: { level: "EXACT", score: 1 } };

  const aliasMatches = catalog.pois.filter((poi) => poi.aliases.some((alias) => normalizePublishedPlaceName(alias) === normalized));
  if (aliasMatches.length > 1) return "AMBIGUOUS";
  if (aliasMatches.length === 1) return { poi: aliasMatches[0], confidence: { level: "ALIAS", score: 0.98 } };
  return null;
}

function localTimeIssues(stop: ExtractedItineraryDraftStop): StructuredItineraryUnresolvedIssue[] {
  if (!stop.arrivalAt || !stop.departureAt) return [];
  const arrivalAt = Date.parse(stop.arrivalAt);
  const departureAt = Date.parse(stop.departureAt);
  if (departureAt < arrivalAt) {
    return [{
      code: "DEPARTURE_BEFORE_ARRIVAL",
      order: stop.order,
      rawPlaceName: stop.rawPlaceName,
      message: "离开时间早于到达时间，需由游客确认。",
    }];
  }
  if (stop.dwellMinutes !== null && Math.abs((departureAt - arrivalAt) / 60_000 - stop.dwellMinutes) > 1) {
    return [{
      code: "DWELL_DURATION_MISMATCH",
      order: stop.order,
      rawPlaceName: stop.rawPlaceName,
      message: "停留时长与到离时间不一致，需由游客确认。",
    }];
  }
  return [];
}

function resolveStop(
  draft: ExtractedItineraryDraftStop,
  catalog: PublishedPoiCatalog,
): { stop: StructuredItineraryStop; unresolved: UnresolvedItineraryLocation[]; timeIssues: StructuredItineraryUnresolvedIssue[] } {
  const timeIssues = localTimeIssues(draft);
  const timeState = timeIssues.length > 0 ? "CONFLICT" : draft.arrivalAt && draft.departureAt ? "VALID" : "INCOMPLETE";
  const match = exactMatch(draft.rawPlaceName, catalog);
  const base: Omit<StructuredItineraryStop, "matchedPoiId" | "matchConfidence" | "resolutionState" | "openingState"> = {
    ...draft,
    timeState,
    routePlanningState: "NOT_PLANNED",
  };

  if (match === "AMBIGUOUS") {
    return {
      stop: { ...base, matchedPoiId: null, matchConfidence: null, resolutionState: "UNRESOLVED", openingState: null },
      unresolved: [{
        rawPlaceName: draft.rawPlaceName,
        order: draft.order,
        reason: "该名称对应多个已发布地点，不能自动选择。",
        code: "AMBIGUOUS_PUBLISHED_POI",
        matchedPoiId: null,
      }],
      timeIssues,
    };
  }
  if (!match) {
    return {
      stop: { ...base, matchedPoiId: null, matchConfidence: null, resolutionState: "UNRESOLVED", openingState: null },
      unresolved: [{
        rawPlaceName: draft.rawPlaceName,
        order: draft.order,
        reason: "未匹配到当前已发布目录中的地点。",
        code: "UNKNOWN_PUBLISHED_POI",
        matchedPoiId: null,
      }],
      timeIssues,
    };
  }

  if (match.poi.openingState === "CLOSED") {
    return {
      stop: {
        ...base,
        matchedPoiId: match.poi.id,
        matchConfidence: match.confidence,
        resolutionState: "UNRESOLVED",
        openingState: "CLOSED",
      },
      unresolved: [{
        rawPlaceName: draft.rawPlaceName,
        order: draft.order,
        reason: "该已发布地点当前标记为关闭，不能纳入可执行行程。",
        code: "POI_CLOSED",
        matchedPoiId: match.poi.id,
      }],
      timeIssues,
    };
  }
  if (match.poi.openingState === "UNKNOWN") {
    return {
      stop: {
        ...base,
        matchedPoiId: match.poi.id,
        matchConfidence: match.confidence,
        resolutionState: "UNRESOLVED",
        openingState: "UNKNOWN",
      },
      unresolved: [{
        rawPlaceName: draft.rawPlaceName,
        order: draft.order,
        reason: "该已发布地点的开放状态不可用，不能纳入可执行行程。",
        code: "POI_OPENING_UNAVAILABLE",
        matchedPoiId: match.poi.id,
      }],
      timeIssues,
    };
  }
  return {
    stop: {
      ...base,
      matchedPoiId: match.poi.id,
      matchConfidence: match.confidence,
      resolutionState: "MATCHED",
      openingState: "OPEN",
    },
    unresolved: [],
    timeIssues,
  };
}

function sequencingIssues(stops: StructuredItineraryStop[]): StructuredItineraryUnresolvedIssue[] {
  const result: StructuredItineraryUnresolvedIssue[] = [];
  let previousWithDeparture: StructuredItineraryStop | null = null;
  for (const stop of stops) {
    if (previousWithDeparture?.departureAt && stop.arrivalAt && Date.parse(previousWithDeparture.departureAt) > Date.parse(stop.arrivalAt)) {
      result.push({
        code: "ORDER_TIME_CONFLICT",
        order: stop.order,
        rawPlaceName: stop.rawPlaceName,
        message: `第 ${previousWithDeparture.order} 站的离开时间晚于本次到达时间，需由游客确认。`,
      });
    }
    if (stop.departureAt) previousWithDeparture = stop;
  }
  return result;
}

function resolveAgainstCatalog(
  request: StructuredItineraryExtractionRequest,
  catalog: PublishedPoiCatalog,
): StructuredItineraryExtraction {
  const resolved = [...request.extraction.stops]
    .sort((left, right) => left.order - right.order)
    .map((draft) => resolveStop(draft, catalog));
  const stops = resolved.map((item) => item.stop);
  const modelReportedUnresolved: UnresolvedItineraryLocation[] = request.extraction.unresolvedLocations.map((item) => ({
    rawPlaceName: item.rawPlaceName,
    order: item.order,
    reason: item.reason,
    code: "MODEL_REPORTED_UNRESOLVED",
    matchedPoiId: null,
  }));
  const unresolvedLocations = [...resolved.flatMap((item) => item.unresolved), ...modelReportedUnresolved]
    .sort((left, right) => left.order - right.order || left.rawPlaceName.localeCompare(right.rawPlaceName, "zh-CN"));
  const unresolvedIssues = [...resolved.flatMap((item) => item.timeIssues), ...sequencingIssues(stops)]
    .sort((left, right) => left.order - right.order || left.code.localeCompare(right.code));

  return {
    schemaVersion: 1,
    scenicAreaId: request.scenicAreaId,
    catalogRevision: catalog.publicationRevision,
    status: "REVIEW_REQUIRED",
    stops,
    unresolvedLocations,
    unresolvedIssues,
    warnings: [
      "地点仅按当前已发布目录进行精确名称或别名匹配；未知或歧义地点保持待确认，不会创建新 POI。",
      "本接口不生成路线、距离、ETA、入口选择或可达性结论；这些必须由独立的正式路网服务计算。",
      "开放状态和时间冲突已在当前发布目录与输入时间中检查；游客仍须在保存前确认行程。",
    ],
  };
}

/**
 * A repository is injected so the matching logic remains deterministic and
 * testable. Any storage error, absent catalog, malformed catalog, expiry, or
 * unpublished dependency is indistinguishable from an unavailable catalog.
 */
export async function resolveStructuredItineraryExtraction(
  repository: PublishedPoiCatalogRepository,
  request: StructuredItineraryExtractionRequest,
  now = new Date(),
): Promise<ResolveStructuredItineraryResult> {
  let rawCatalog: PublishedPoiCatalog | null;
  try {
    rawCatalog = await repository.readCurrentPublishedPoiCatalog(request.scenicAreaId);
  } catch {
    return { state: "PUBLISHED_CATALOG_UNAVAILABLE" };
  }
  const catalog = rawCatalog ? validatePublishedPoiCatalog(rawCatalog, request.scenicAreaId, now) : null;
  if (!catalog) return { state: "PUBLISHED_CATALOG_UNAVAILABLE" };
  if (catalog.publicationRevision !== request.expectedCatalogRevision) {
    return { state: "CATALOG_REVISION_CHANGED", catalogRevision: catalog.publicationRevision };
  }
  return { state: "AVAILABLE", itinerary: resolveAgainstCatalog(request, catalog) };
}
