import "server-only";

import { getDatabase } from "./database";
import { parseServerSharePayload } from "./share-link-domain";
import { isConsentPurpose } from "./visitor-data-rights-domain";
import type {
  VisitorConsentRecord,
  VisitorDataExport,
  VisitorDataRightsRepository,
} from "./visitor-data-rights-service";

type Timestamp = Date | string;

type AccountRow = {
  id: string;
  scenic_area_id: string;
  subject: string;
  handle: string;
  created_at: Timestamp;
};

type ConsentRow = {
  purpose: string;
  granted: boolean;
  revision: number;
  recorded_at: Timestamp;
};

type DataSubjectRequestRow = {
  id: string;
  request_type: string;
  request_reference: string;
  completed_at: Timestamp | null;
};

type ItineraryRow = {
  id: string;
  revision: number;
  lifecycle_state: string;
  title: string;
  starts_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ItineraryStopRow = {
  itinerary_id: string;
  sequence: number;
  original_place_name: string;
  matched_poi_id: string | null;
  arrival_at: Timestamp | null;
  departure_at: Timestamp | null;
  dwell_minutes: number | null;
  rationale: string | null;
  travel_mode: string | null;
  meal_note: string | null;
  rest_note: string | null;
  caution_note: string | null;
  unresolved: boolean;
};

type VisitSessionRow = {
  id: string;
  itinerary_id: string | null;
  itinerary_revision: number | null;
  lifecycle_state: string;
  narration_enabled: boolean;
  started_at: Timestamp | null;
  ended_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type VisitSessionEventRow = {
  visit_session_id: string;
  event_type: string;
  occurred_at: Timestamp;
};

type NavigationSessionRow = {
  id: string;
  route_fingerprint: string;
  optimization_strategy: string;
  origin_node_code: string;
  destination_node_code: string;
  network_revision: string;
  operational_version: number;
  session_status: string;
  revision: number;
  initial_distance_meters: number | string;
  estimated_minutes: number | string;
  last_remaining_distance_meters: number | string;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  expires_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type NavigationSessionEventRow = {
  navigation_session_id: string;
  event_kind: string;
  resulting_revision: number;
  remaining_distance_bucket_meters: number;
  reason_code: string | null;
  occurred_at: Timestamp;
};

type ShareLinkRow = {
  id: string;
  payload: unknown;
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
};

type OwnedShareRow = {
  id: string;
  revoked_at: Timestamp | null;
};

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_visitor_data_rights_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function mapConsent(row: ConsentRow): VisitorConsentRecord {
  if (!isConsentPurpose(row.purpose) || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("invalid_visitor_consent_record");
  }
  return {
    purpose: row.purpose,
    granted: row.granted,
    revision: row.revision,
    recordedAt: toIso(row.recorded_at),
  };
}

export const postgresVisitorDataRightsRepository: VisitorDataRightsRepository = {
  async listConsents(identity) {
    const sql = getDatabase();
    const rows = await sql<ConsentRow[]>`
      SELECT purpose, granted, revision, recorded_at
      FROM visitor_consents
      WHERE scenic_area_id = ${identity.scenicAreaId} AND account_id = ${identity.accountId}
      ORDER BY purpose ASC
    `;
    return rows.map(mapConsent);
  },

  async writeConsent(input) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const accounts = await transaction<{ id: string }[]>`
        SELECT id
        FROM visitor_accounts
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND id = ${input.identity.accountId}
          AND subject = ${input.identity.subject}
        FOR UPDATE
      `;
      if (!accounts[0]) return { state: "ACCOUNT_NOT_FOUND" as const };

      const priorIdempotent = await transaction<ConsentRow[]>`
        SELECT purpose, granted, revision, recorded_at
        FROM visitor_consents
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND idempotency_key_hash = ${input.idempotencyKeyHash}
        FOR UPDATE
      `;
      const replay = priorIdempotent[0];
      if (replay) {
        if (replay.purpose !== input.consent.purpose || replay.granted !== input.consent.granted) {
          return { state: "IDEMPOTENCY_CONFLICT" as const };
        }
        return { state: "REPLAYED" as const, consent: mapConsent(replay) };
      }

      const existingRows = await transaction<ConsentRow[]>`
        SELECT purpose, granted, revision, recorded_at
        FROM visitor_consents
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND purpose = ${input.consent.purpose}
        FOR UPDATE
      `;
      const existing = existingRows[0];
      if (!existing) {
        if (input.consent.expectedRevision !== 0) {
          return { state: "REVISION_CONFLICT" as const, currentRevision: null };
        }
        const rows = await transaction<ConsentRow[]>`
          INSERT INTO visitor_consents (
            scenic_area_id, account_id, purpose, granted, revision, expected_revision,
            idempotency_key_hash, recorded_at
          ) VALUES (
            ${input.identity.scenicAreaId}, ${input.identity.accountId}, ${input.consent.purpose},
            ${input.consent.granted}, 1, ${input.consent.expectedRevision},
            ${input.idempotencyKeyHash}, ${input.recordedAt}
          )
          RETURNING purpose, granted, revision, recorded_at
        `;
        return { state: "APPLIED" as const, consent: mapConsent(rows[0]) };
      }

      const current = mapConsent(existing);
      if (current.revision !== input.consent.expectedRevision) {
        return { state: "REVISION_CONFLICT" as const, currentRevision: current.revision };
      }
      const rows = await transaction<ConsentRow[]>`
        UPDATE visitor_consents
        SET granted = ${input.consent.granted},
            revision = ${current.revision + 1},
            expected_revision = ${input.consent.expectedRevision},
            idempotency_key_hash = ${input.idempotencyKeyHash},
            recorded_at = ${input.recordedAt}
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND purpose = ${input.consent.purpose}
        RETURNING purpose, granted, revision, recorded_at
      `;
      return { state: "APPLIED" as const, consent: mapConsent(rows[0]) };
    });
  },

  async exportData(input) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const accounts = await transaction<AccountRow[]>`
        SELECT id, scenic_area_id, subject, handle, created_at
        FROM visitor_accounts
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND id = ${input.identity.accountId}
          AND subject = ${input.identity.subject}
        FOR SHARE
      `;
      const account = accounts[0];
      if (!account) return { state: "ACCOUNT_NOT_FOUND" as const };

      const existingRequests = await transaction<DataSubjectRequestRow[]>`
        SELECT id, request_type, request_reference, completed_at
        FROM data_subject_requests
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND idempotency_key_hash = ${input.idempotencyKeyHash}
        FOR UPDATE
      `;
      const existingRequest = existingRequests[0];
      if (existingRequest && existingRequest.request_type !== "EXPORT") {
        return { state: "IDEMPOTENCY_CONFLICT" as const };
      }
      const request = existingRequest ?? (await transaction<DataSubjectRequestRow[]>`
        INSERT INTO data_subject_requests (
          scenic_area_id, account_id, request_type, lifecycle_state, request_reference,
          idempotency_key_hash, created_at, completed_at
        ) VALUES (
          ${input.identity.scenicAreaId}, ${input.identity.accountId}, 'EXPORT', 'COMPLETED',
          ${input.requestReference}, ${input.idempotencyKeyHash}, ${input.exportedAt}, ${input.exportedAt}
        )
        RETURNING id, request_type, request_reference, completed_at
      `)[0];
      if (!request) throw new Error("data_subject_export_request_not_created");

      const [consentRows, itineraryRows, stopRows, visitSessionRows, eventRows, navigationSessionRows, navigationEventRows, shareRows] = await Promise.all([
        transaction<ConsentRow[]>`
          SELECT purpose, granted, revision, recorded_at
          FROM visitor_consents
          WHERE scenic_area_id = ${input.identity.scenicAreaId} AND account_id = ${input.identity.accountId}
          ORDER BY purpose ASC
        `,
        transaction<ItineraryRow[]>`
          SELECT id, revision, lifecycle_state, title, starts_at, created_at, updated_at
          FROM itineraries
          WHERE scenic_area_id = ${input.identity.scenicAreaId} AND owner_account_id = ${input.identity.accountId}
          ORDER BY created_at ASC, id ASC
        `,
        transaction<ItineraryStopRow[]>`
          SELECT s.itinerary_id, s.sequence, s.original_place_name, s.matched_poi_id,
                 s.arrival_at, s.departure_at, s.dwell_minutes, s.rationale, s.travel_mode,
                 s.meal_note, s.rest_note, s.caution_note, s.unresolved
          FROM itinerary_stops AS s
          JOIN itineraries AS i ON i.id = s.itinerary_id
          WHERE i.scenic_area_id = ${input.identity.scenicAreaId} AND i.owner_account_id = ${input.identity.accountId}
          ORDER BY s.itinerary_id ASC, s.itinerary_revision ASC, s.sequence ASC
        `,
        transaction<VisitSessionRow[]>`
          SELECT id, itinerary_id, itinerary_revision, lifecycle_state, narration_enabled,
                 started_at, ended_at, created_at, updated_at
          FROM visit_sessions
          WHERE scenic_area_id = ${input.identity.scenicAreaId} AND owner_account_id = ${input.identity.accountId}
          ORDER BY created_at ASC, id ASC
        `,
        transaction<VisitSessionEventRow[]>`
          SELECT e.visit_session_id, e.event_type, e.occurred_at
          FROM visit_session_events AS e
          JOIN visit_sessions AS s ON s.id = e.visit_session_id
          WHERE s.scenic_area_id = ${input.identity.scenicAreaId} AND s.owner_account_id = ${input.identity.accountId}
          ORDER BY e.visit_session_id ASC, e.occurred_at ASC, e.id ASC
        `,
        transaction<NavigationSessionRow[]>`
          SELECT session.id, session.route_fingerprint, session.optimization_strategy,
                 session.origin_node_code, session.destination_node_code,
                 network.revision AS network_revision, operational.operational_version,
                 session.session_status, session.revision, session.initial_distance_meters,
                 session.estimated_minutes, session.last_remaining_distance_meters,
                 session.started_at, session.completed_at, session.expires_at,
                 session.created_at, session.updated_at
          FROM navigation_sessions AS session
          JOIN route_network_revisions AS network
            ON network.id = session.network_revision_id AND network.scenic_area_id = session.scenic_area_id
          JOIN route_operational_versions AS operational
            ON operational.id = session.operational_version_id AND operational.scenic_area_id = session.scenic_area_id
          WHERE session.scenic_area_id = ${input.identity.scenicAreaId}
            AND session.account_id = ${input.identity.accountId}
            AND session.create_idempotency_key_hash IS NOT NULL
          ORDER BY session.created_at ASC, session.id ASC
        `,
        transaction<NavigationSessionEventRow[]>`
          SELECT event.navigation_session_id, event.event_kind, event.resulting_revision,
                 event.remaining_distance_bucket_meters, event.reason_code, event.occurred_at
          FROM navigation_session_events AS event
          JOIN navigation_sessions AS session ON session.id = event.navigation_session_id
          WHERE session.scenic_area_id = ${input.identity.scenicAreaId}
            AND session.account_id = ${input.identity.accountId}
            AND session.create_idempotency_key_hash IS NOT NULL
          ORDER BY event.navigation_session_id ASC, event.resulting_revision ASC, event.id ASC
        `,
        transaction<ShareLinkRow[]>`
          SELECT id, payload, created_at, expires_at, revoked_at
          FROM share_links
          WHERE scenic_area_id = ${input.identity.scenicAreaId}
            AND created_by_account_id = ${input.identity.accountId}
            AND created_by_subject = ${input.identity.subject}
          ORDER BY created_at ASC, id ASC
        `,
      ]);

      const stopsByItinerary = new Map<string, VisitorDataExport["itineraries"][number]["stops"]>();
      for (const stop of stopRows) {
        const values = stopsByItinerary.get(stop.itinerary_id) ?? [];
        values.push({
          sequence: stop.sequence,
          originalPlaceName: stop.original_place_name,
          matchedPoiId: stop.matched_poi_id,
          arrivalAt: nullableIso(stop.arrival_at),
          departureAt: nullableIso(stop.departure_at),
          dwellMinutes: stop.dwell_minutes,
          rationale: stop.rationale,
          travelMode: stop.travel_mode,
          mealNote: stop.meal_note,
          restNote: stop.rest_note,
          cautionNote: stop.caution_note,
          unresolved: stop.unresolved,
        });
        stopsByItinerary.set(stop.itinerary_id, values);
      }

      const eventsBySession = new Map<string, VisitorDataExport["visitSessions"][number]["events"]>();
      for (const event of eventRows) {
        const values = eventsBySession.get(event.visit_session_id) ?? [];
        values.push({ type: event.event_type, occurredAt: toIso(event.occurred_at) });
        eventsBySession.set(event.visit_session_id, values);
      }

      const navigationEventsBySession = new Map<string, VisitorDataExport["navigationSessions"][number]["events"]>();
      for (const event of navigationEventRows) {
        const values = navigationEventsBySession.get(event.navigation_session_id) ?? [];
        values.push({
          type: event.event_kind,
          revision: event.resulting_revision,
          remainingDistanceBucketMeters: event.remaining_distance_bucket_meters,
          reasonCode: event.reason_code,
          occurredAt: toIso(event.occurred_at),
        });
        navigationEventsBySession.set(event.navigation_session_id, values);
      }

      const completedAt = request.completed_at ? toIso(request.completed_at) : input.exportedAt;
      const data: VisitorDataExport = {
        schemaVersion: 1,
        exportedAt: input.exportedAt,
        receipt: { reference: request.request_reference, completedAt },
        visitor: {
          scenicAreaId: account.scenic_area_id,
          subject: account.subject,
          handle: account.handle,
          createdAt: toIso(account.created_at),
        },
        consents: consentRows.map(mapConsent),
        itineraries: itineraryRows.map((itinerary) => ({
          id: itinerary.id,
          revision: itinerary.revision,
          lifecycleState: itinerary.lifecycle_state,
          title: itinerary.title,
          startsAt: nullableIso(itinerary.starts_at),
          createdAt: toIso(itinerary.created_at),
          updatedAt: toIso(itinerary.updated_at),
          stops: stopsByItinerary.get(itinerary.id) ?? [],
        })),
        visitSessions: visitSessionRows.map((session) => ({
          id: session.id,
          itineraryId: session.itinerary_id,
          itineraryRevision: session.itinerary_revision,
          lifecycleState: session.lifecycle_state,
          narrationEnabled: session.narration_enabled,
          startedAt: nullableIso(session.started_at),
          endedAt: nullableIso(session.ended_at),
          createdAt: toIso(session.created_at),
          updatedAt: toIso(session.updated_at),
          events: eventsBySession.get(session.id) ?? [],
        })),
        navigationSessions: navigationSessionRows.map((session) => ({
          id: session.id,
          routeFingerprint: session.route_fingerprint,
          optimization: session.optimization_strategy,
          originNodeId: session.origin_node_code,
          destinationNodeId: session.destination_node_code,
          networkRevision: session.network_revision,
          operationalVersion: session.operational_version,
          status: session.session_status,
          revision: session.revision,
          distanceMeters: Number(session.initial_distance_meters),
          estimatedMinutes: Number(session.estimated_minutes),
          remainingDistanceBucketMeters: Number(session.last_remaining_distance_meters),
          startedAt: nullableIso(session.started_at),
          endedAt: nullableIso(session.completed_at),
          expiresAt: toIso(session.expires_at),
          createdAt: toIso(session.created_at),
          updatedAt: toIso(session.updated_at),
          events: navigationEventsBySession.get(session.id) ?? [],
        })),
        shareLinks: shareRows.map((share) => ({
          id: share.id,
          createdAt: toIso(share.created_at),
          expiresAt: toIso(share.expires_at),
          revokedAt: nullableIso(share.revoked_at),
          route: parseServerSharePayload(share.payload),
        })),
      };
      return { state: existingRequest ? "REPLAYED" as const : "COMPLETED" as const, data };
    });
  },

  async deleteAccount(input) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const accounts = await transaction<{ id: string }[]>`
        SELECT id
        FROM visitor_accounts
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND id = ${input.identity.accountId}
          AND subject = ${input.identity.subject}
        FOR UPDATE
      `;
      if (!accounts[0]) return { state: "ACCOUNT_NOT_FOUND" as const };

      const conflictingRequest = await transaction<{ request_type: string }[]>`
        SELECT request_type
        FROM data_subject_requests
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND idempotency_key_hash = ${input.idempotencyKeyHash}
        FOR UPDATE
      `;
      if (conflictingRequest[0]) return { state: "IDEMPOTENCY_CONFLICT" as const };

      const requestRows = await transaction<DataSubjectRequestRow[]>`
        INSERT INTO data_subject_requests (
          scenic_area_id, account_id, request_type, lifecycle_state, request_reference,
          idempotency_key_hash, created_at
        ) VALUES (
          ${input.identity.scenicAreaId}, ${input.identity.accountId}, 'DELETE_ACCOUNT', 'PROCESSING',
          ${input.requestReference}, ${input.idempotencyKeyHash}, ${input.deletedAt}
        )
        RETURNING id, request_type, request_reference, completed_at
      `;
      const request = requestRows[0];
      if (!request) throw new Error("data_subject_delete_request_not_created");

      await transaction`
        UPDATE visitor_sessions
        SET revoked_at = ${input.deletedAt}
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND account_id = ${input.identity.accountId}
          AND revoked_at IS NULL
      `;

      const ownedShares = await transaction<OwnedShareRow[]>`
        SELECT id, revoked_at
        FROM share_links
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND created_by_account_id = ${input.identity.accountId}
          AND created_by_subject = ${input.identity.subject}
        FOR UPDATE
      `;
      const shareIds = ownedShares.map((share) => share.id);
      if (shareIds.length > 0) {
        await transaction`
          UPDATE share_links
          SET revoked_at = COALESCE(revoked_at, ${input.deletedAt}), updated_at = ${input.deletedAt}
          WHERE id = ANY(${shareIds}::uuid[])
        `;
        await transaction`
          UPDATE share_link_audit_events
          SET actor_subject = NULL, metadata = '{}'::jsonb
          WHERE share_link_id = ANY(${shareIds}::uuid[])
        `;
        for (const share of ownedShares.filter((item) => item.revoked_at === null)) {
          await transaction`
            INSERT INTO share_link_audit_events (share_link_id, event_type, actor_subject, occurred_at)
            VALUES (${share.id}, 'REVOKED', NULL, ${input.deletedAt})
          `;
        }
        await transaction`
          DELETE FROM share_links
          WHERE id = ANY(${shareIds}::uuid[])
        `;
      }

      await transaction`
        UPDATE visitor_auth_audit_events
        SET account_id = NULL, actor_subject = NULL, metadata = '{}'::jsonb
        WHERE scenic_area_id = ${input.identity.scenicAreaId} AND account_id = ${input.identity.accountId}
      `;
      await transaction`
        UPDATE data_subject_requests
        SET account_id = NULL,
            lifecycle_state = CASE WHEN id = ${request.id} THEN 'COMPLETED' ELSE lifecycle_state END,
            completed_at = CASE WHEN id = ${request.id} THEN ${input.deletedAt} ELSE completed_at END
        WHERE scenic_area_id = ${input.identity.scenicAreaId} AND account_id = ${input.identity.accountId}
      `;
      const deleted = await transaction<{ id: string }[]>`
        DELETE FROM visitor_accounts
        WHERE scenic_area_id = ${input.identity.scenicAreaId}
          AND id = ${input.identity.accountId}
          AND subject = ${input.identity.subject}
        RETURNING id
      `;
      if (!deleted[0]) throw new Error("visitor_account_delete_failed");

      return {
        state: "DELETED" as const,
        receipt: { reference: request.request_reference, completedAt: input.deletedAt },
      };
    });
  },
};
