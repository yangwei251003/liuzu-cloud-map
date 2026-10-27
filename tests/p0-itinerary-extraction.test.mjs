import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStructuredItineraryExtractionRequest,
  validatePublishedPoiCatalog,
} from "../src/lib/p0-itinerary-extraction/domain.ts";
import { resolveStructuredItineraryExtraction } from "../src/lib/p0-itinerary-extraction/service.ts";
import { handleStructuredItineraryExtractionRequest } from "../src/lib/server/p0-itinerary-extraction-http.ts";

const now = new Date("2026-08-15T08:00:00.000Z");

function catalog(overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    publicationRevision: 7,
    publicationState: "PUBLISHED",
    publishedAt: "2026-08-15T07:45:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    pois: [
      {
        id: "south-gate",
        canonicalName: "南门",
        aliases: ["主入口"],
        verificationState: "FIELD_VERIFIED",
        sourceLicenseState: "CLEARED",
        validUntil: "2026-12-10T00:00:00.000Z",
        openingState: "OPEN",
      },
      {
        id: "meditation-hall",
        canonicalName: "静修堂",
        aliases: ["古寺"],
        verificationState: "FIELD_VERIFIED",
        sourceLicenseState: "CLEARED",
        validUntil: "2026-12-10T00:00:00.000Z",
        openingState: "CLOSED",
      },
      {
        id: "quiet-garden",
        canonicalName: "清心园",
        aliases: ["安静花园"],
        verificationState: "FIELD_VERIFIED",
        sourceLicenseState: "CLEARED",
        validUntil: "2026-12-10T00:00:00.000Z",
        openingState: "UNKNOWN",
      },
    ],
    ...overrides,
  };
}

function requestBody(overrides = {}) {
  return {
    schemaVersion: 1,
    scenicAreaId: "fictional-park",
    expectedCatalogRevision: 7,
    extraction: {
      stops: [
        {
          rawPlaceName: " 南门 ",
          order: 1,
          arrivalAt: "2026-08-15T08:30:00+08:00",
          departureAt: "2026-08-15T09:00:00+08:00",
          dwellMinutes: 30,
          reason: "游记中的起点",
          travelMode: "WALK",
          mealNote: null,
          restNote: "短暂休息",
          cautionNote: "注意入口指示",
        },
        {
          rawPlaceName: "古寺",
          order: 2,
          arrivalAt: null,
          departureAt: null,
          dwellMinutes: 45,
          reason: "游记中的参观意图",
          travelMode: "WALK",
          mealNote: "自备饮水",
          restNote: null,
          cautionNote: null,
        },
        {
          rawPlaceName: "云中阁",
          order: 3,
          arrivalAt: null,
          departureAt: null,
          dwellMinutes: null,
          reason: null,
          travelMode: null,
          mealNote: null,
          restNote: null,
          cautionNote: null,
        },
      ],
      unresolvedLocations: [{ rawPlaceName: "山间茶点", order: 4, reason: "原文未说明具体位置。" }],
    },
    ...overrides,
  };
}

function memoryRepository(value = catalog()) {
  return {
    async readCurrentPublishedPoiCatalog(scenicAreaId) {
      return scenicAreaId === "fictional-park" && value ? structuredClone(value) : null;
    },
  };
}

function post(body, headers = {}) {
  return new Request("https://tour.example/api/v1/itinerary-extractions", {
    method: "POST",
    headers: { origin: "https://tour.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("strict input preserves only raw extraction fields and rejects POI IDs or coordinates", () => {
  const parsed = parseStructuredItineraryExtractionRequest(requestBody());
  assert.ok(parsed);
  assert.equal(parsed.extraction.stops[0].rawPlaceName, "南门");
  assert.equal(parsed.extraction.stops[0].travelMode, "WALK");
  assert.equal(parsed.extraction.stops[0].restNote, "短暂休息");
  assert.equal(parsed.extraction.unresolvedLocations[0].rawPlaceName, "山间茶点");

  const withPoiId = requestBody();
  withPoiId.extraction.stops[0].poiId = "south-gate";
  assert.equal(parseStructuredItineraryExtractionRequest(withPoiId), null);

  const withCoordinates = requestBody();
  withCoordinates.extraction.stops[0].coordinates = [112.1, 22.2];
  assert.equal(parseStructuredItineraryExtractionRequest(withCoordinates), null);

  const duplicateOrder = requestBody();
  duplicateOrder.extraction.unresolvedLocations[0].order = 1;
  assert.equal(parseStructuredItineraryExtractionRequest(duplicateOrder), null);
});

test("published catalog matching is deterministic, keeps all extracted fields, and never creates unknown POIs", async () => {
  const input = parseStructuredItineraryExtractionRequest(requestBody());
  assert.ok(input);
  const result = await resolveStructuredItineraryExtraction(memoryRepository(), input, now);
  assert.equal(result.state, "AVAILABLE");
  if (result.state !== "AVAILABLE") return;

  const [entry, closed, unknown] = result.itinerary.stops;
  assert.equal(entry.matchedPoiId, "south-gate");
  assert.deepEqual(entry.matchConfidence, { level: "EXACT", score: 1 });
  assert.equal(entry.resolutionState, "MATCHED");
  assert.equal(entry.arrivalAt, "2026-08-15T08:30:00+08:00");
  assert.equal(entry.dwellMinutes, 30);
  assert.equal(entry.reason, "游记中的起点");
  assert.equal(entry.restNote, "短暂休息");
  assert.equal(entry.routePlanningState, "NOT_PLANNED");

  assert.equal(closed.matchedPoiId, "meditation-hall");
  assert.deepEqual(closed.matchConfidence, { level: "ALIAS", score: 0.98 });
  assert.equal(closed.resolutionState, "UNRESOLVED");
  assert.equal(closed.openingState, "CLOSED");

  assert.equal(unknown.matchedPoiId, null);
  assert.equal(unknown.matchConfidence, null);
  assert.equal(unknown.resolutionState, "UNRESOLVED");
  assert.deepEqual(
    result.itinerary.unresolvedLocations.map(({ code, matchedPoiId }) => ({ code, matchedPoiId })),
    [
      { code: "POI_CLOSED", matchedPoiId: "meditation-hall" },
      { code: "UNKNOWN_PUBLISHED_POI", matchedPoiId: null },
      { code: "MODEL_REPORTED_UNRESOLVED", matchedPoiId: null },
    ],
  );
});

test("time conflicts are backend-derived without changing model order or inventing a route", async () => {
  const payload = requestBody({
    extraction: {
      stops: [
        {
          ...requestBody().extraction.stops[0],
          order: 1,
          arrivalAt: "2026-08-15T09:00:00+08:00",
          departureAt: "2026-08-15T08:30:00+08:00",
          dwellMinutes: 30,
        },
        {
          ...requestBody().extraction.stops[1],
          order: 2,
          rawPlaceName: "主入口",
          arrivalAt: "2026-08-15T08:45:00+08:00",
          departureAt: "2026-08-15T09:00:00+08:00",
          dwellMinutes: 80,
        },
      ],
      unresolvedLocations: [],
    },
  });
  const input = parseStructuredItineraryExtractionRequest(payload);
  assert.ok(input);
  const result = await resolveStructuredItineraryExtraction(memoryRepository(), input, now);
  assert.equal(result.state, "AVAILABLE");
  if (result.state !== "AVAILABLE") return;
  assert.deepEqual(result.itinerary.stops.map((stop) => stop.order), [1, 2]);
  assert.equal(result.itinerary.stops[0].timeState, "CONFLICT");
  assert.equal(result.itinerary.stops[1].timeState, "CONFLICT");
  assert.deepEqual(
    result.itinerary.unresolvedIssues.map(({ code, order }) => ({ code, order })),
    [
      { code: "DEPARTURE_BEFORE_ARRIVAL", order: 1 },
      { code: "DWELL_DURATION_MISMATCH", order: 2 },
    ],
  );
  assert.ok(result.itinerary.warnings.some((warning) => warning.includes("不生成路线")));
});

test("missing, unpublished, malformed, expired, and revision-changed catalogs fail closed", async () => {
  const input = parseStructuredItineraryExtractionRequest(requestBody());
  assert.ok(input);
  assert.deepEqual(
    await resolveStructuredItineraryExtraction(memoryRepository(null), input, now),
    { state: "PUBLISHED_CATALOG_UNAVAILABLE" },
  );
  assert.equal(validatePublishedPoiCatalog(catalog({ publicationState: "DRAFT" }), "fictional-park", now), null);
  assert.equal(validatePublishedPoiCatalog(catalog({ expiresAt: "2026-08-15T07:59:59.000Z" }), "fictional-park", now), null);
  const noRights = catalog();
  noRights.pois[0].sourceLicenseState = "PENDING";
  assert.equal(validatePublishedPoiCatalog(noRights, "fictional-park", now), null);
  assert.deepEqual(
    await resolveStructuredItineraryExtraction(memoryRepository(catalog({ publicationRevision: 8 })), input, now),
    { state: "CATALOG_REVISION_CHANGED", catalogRevision: 8 },
  );
});

test("HTTP handler has same-origin, bounded, no-store, request-ID and unavailable-catalog controls", async () => {
  const success = await handleStructuredItineraryExtractionRequest(post(requestBody()), memoryRepository(), now);
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(success.headers.get("cross-origin-resource-policy"), "same-origin");
  const successBody = await success.json();
  assert.match(successBody.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(success.headers.get("x-request-id"), successBody.requestId);

  const crossOrigin = await handleStructuredItineraryExtractionRequest(
    post(requestBody(), { origin: "https://attacker.example" }),
    memoryRepository(),
    now,
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "REQUEST_REJECTED");

  const invalid = requestBody();
  invalid.extraction.stops[0].latitude = 22.2;
  const invalidResponse = await handleStructuredItineraryExtractionRequest(post(invalid), memoryRepository(), now);
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "INVALID_ITINERARY_EXTRACTION");

  const oversized = await handleStructuredItineraryExtractionRequest(
    post({}, { "content-length": "12289" }),
    memoryRepository(),
    now,
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");

  const unavailable = await handleStructuredItineraryExtractionRequest(post(requestBody()), memoryRepository(null), now);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "PUBLISHED_CATALOG_UNAVAILABLE");
});
