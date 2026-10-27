import "server-only";

import type { Sql, TransactionSql } from "postgres";

import { getDatabase } from "./database";
import {
  isDeletedItineraryReceipt,
  isItineraryCurrentRevision,
  isItineraryId,
  isItineraryReceipt,
  type DeletedItineraryReceipt,
  type ItineraryEditInput,
  type ItineraryReceipt,
  type ItineraryStopInput,
} from "./itinerary-revision-domain";
import type {
  DeleteItineraryCommand,
  EditItineraryCommand,
  ItineraryIdentity,
  ItineraryRepository,
} from "./itinerary-revision-service";

type Timestamp = Date | string;
type QueryExecutor = Sql | TransactionSql;

type ItineraryRow = {
  id: string;
  scenic_area_id: string;
  owner_account_id: string | null;
  revision: number;
  lifecycle_state: string;
  title: string;
  starts_at: Timestamp | null;
  entrance_id: string | null;
  expected_revision: number;
  idempotency_key_hash: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
};

type ItineraryStopRow = {
  itinerary_id: string;
  itinerary_revision: number;
  sequence: number;
  original_place_name: string;
  matched_poi_id: string | null;
  dwell_minutes: number | null;
  unresolved: boolean;
};

type PublishedPoiRow = {
  id: string;
  label: string;
};

const ACTIVE_SESSION_STATES = ["READY", "STARTED", "PAUSED", "REPLANNING", "ARRIVED", "SKIPPED"] as const;

function toIso(value: Timestamp) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_itinerary_timestamp");
  return date.toISOString();
}

function nullableIso(value: Timestamp | null) {
  return value === null ? null : toIso(value);
}

function assertItineraryRow(row: ItineraryRow) {
  if (
    !isItineraryId(row.id)
    || !isItineraryCurrentRevision(row.revision)
    || !Number.isSafeInteger(row.expected_revision)
    || row.expected_revision !== row.revision - 1
    || typeof row.scenic_area_id !== "string"
    || !isItineraryId(row.owner_account_id)
    || typeof row.title !== "string"
    || typeof row.idempotency_key_hash !== "string"
  ) {
    throw new Error("invalid_itinerary_row");
  }
}

function mapItinerary(row: ItineraryRow, stops: ItineraryStopRow[]): ItineraryReceipt {
  assertItineraryRow(row);
  if (row.lifecycle_state !== "SAVED" || row.deleted_at !== null) throw new Error("invalid_saved_itinerary_state");
  const receipt: ItineraryReceipt = {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    revision: row.revision,
    lifecycleState: "SAVED",
    title: row.title,
    startsAt: nullableIso(row.starts_at),
    entranceId: row.entrance_id,
    executionState: "REPLAN_REQUIRED",
    stops: stops.map((stop) => {
      if (
        stop.itinerary_id !== row.id
        || stop.itinerary_revision !== row.revision
        || !Number.isSafeInteger(stop.sequence)
        || stop.sequence < 1
        || !isItineraryId(stop.matched_poi_id)
        || stop.unresolved !== false
      ) {
        throw new Error("invalid_itinerary_stop_row");
      }
      return {
        sequence: stop.sequence,
        poiId: stop.matched_poi_id,
        label: stop.original_place_name,
        dwellMinutes: stop.dwell_minutes,
      };
    }),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  if (!isItineraryReceipt(receipt)) throw new Error("invalid_itinerary_receipt");
  return receipt;
}

function mapDeletedItinerary(row: ItineraryRow): DeletedItineraryReceipt {
  assertItineraryRow(row);
  if (row.lifecycle_state !== "DELETED" || row.deleted_at === null) throw new Error("invalid_deleted_itinerary_state");
  const receipt: DeletedItineraryReceipt = {
    id: row.id,
    scenicAreaId: row.scenic_area_id,
    revision: row.revision,
    lifecycleState: "DELETED",
    executionState: "INVALIDATED",
    deletedAt: toIso(row.deleted_at),
  };
  if (!isDeletedItineraryReceipt(receipt)) throw new Error("invalid_deleted_itinerary_receipt");
  return receipt;
}

async function readStops(sql: QueryExecutor, itineraryId: string, revision: number) {
  return sql<ItineraryStopRow[]>`
    SELECT itinerary_id, itinerary_revision, sequence, original_place_name, matched_poi_id, dwell_minutes, unresolved
    FROM itinerary_stops
    WHERE itinerary_id = ${itineraryId}
      AND itinerary_revision = ${revision}
    ORDER BY sequence ASC
  `;
}

async function receiptForRow(sql: QueryExecutor, row: ItineraryRow) {
  return mapItinerary(row, await readStops(sql, row.id, row.revision));
}

function matchesEditableInput(receipt: ItineraryReceipt, input: ItineraryEditInput | { title: string; startsAt: string | null; entranceId: string | null; stops: ItineraryStopInput[]; expectedRevision: number }) {
  return receipt.revision === input.expectedRevision + 1
    && receipt.title === input.title
    && receipt.startsAt === input.startsAt
    && receipt.entranceId === input.entranceId
    && receipt.stops.length === input.stops.length
    && receipt.stops.every((stop, index) => stop.poiId === input.stops[index]?.poiId && stop.dwellMinutes === input.stops[index]?.dwellMinutes);
}

/**
 * POI selection is anchored to the currently published, unwithdrawn snapshot
 * rather than the prototype map catalog. Every POI and optional entrance has
 * to share that publication and a cleared, verified, unexpired source. A
 * missing snapshot, invalid rights, an expired item, or an unopened catalog
 * returns no selection so callers fail closed.
 */
async function publishedSelections(
  sql: QueryExecutor,
  scenicAreaId: string,
  stops: ItineraryStopInput[],
  entranceId: string | null,
  at: string,
) {
  const poiIds = stops.map((stop) => stop.poiId);
  const poiRows = await sql<PublishedPoiRow[]>`
    WITH active_publication AS (
      SELECT snapshot.publication_id
      FROM scenic_published_snapshots AS snapshot
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = snapshot.scenic_area_id
      WHERE snapshot.scenic_area_id = ${scenicAreaId}
        AND snapshot.lifecycle_state = 'PUBLISHED'
        AND snapshot.published_at IS NOT NULL
        AND snapshot.published_by_subject IS NOT NULL
        AND snapshot.withdrawn_at IS NULL
        AND snapshot.expires_at > ${at}
        AND publication.lifecycle_state = 'PUBLISHED'
        AND publication.published_at IS NOT NULL
        AND publication.published_by_subject IS NOT NULL
        AND publication.withdrawn_at IS NULL
        AND publication.valid_until > ${at}
      ORDER BY snapshot.snapshot_revision DESC
      LIMIT 1
    )
    SELECT poi.id, poi.label
    FROM published_pois AS poi
    INNER JOIN active_publication AS active ON active.publication_id = poi.publication_id
    INNER JOIN data_sources AS source
      ON source.id = poi.source_id
     AND source.scenic_area_id = poi.scenic_area_id
    INNER JOIN published_opening_rules AS opening_rule
      ON opening_rule.id = poi.opening_rule_id
     AND opening_rule.publication_id = poi.publication_id
     AND opening_rule.scenic_area_id = poi.scenic_area_id
    INNER JOIN data_sources AS opening_source
      ON opening_source.id = opening_rule.source_id
     AND opening_source.scenic_area_id = opening_rule.scenic_area_id
    WHERE poi.scenic_area_id = ${scenicAreaId}
      AND poi.id = ANY(${poiIds}::uuid[])
      AND poi.verification_state = 'FIELD_VERIFIED'
      AND poi.valid_until > ${at}
      AND source.license_state = 'CLEARED'
      AND source.verified_at IS NOT NULL
      AND source.verified_by_subject IS NOT NULL
      AND source.valid_until > ${at}
      AND opening_rule.verification_state = 'VERIFIED'
      AND opening_rule.valid_from <= ${at}
      AND opening_rule.valid_until > ${at}
      AND opening_source.license_state = 'CLEARED'
      AND opening_source.verified_at IS NOT NULL
      AND opening_source.verified_by_subject IS NOT NULL
      AND opening_source.valid_until > ${at}
  `;
  if (poiRows.length !== poiIds.length || new Set(poiRows.map((row) => row.id)).size !== poiIds.length) return null;
  const pois = new Map(poiRows.map((row) => [row.id, row]));
  if (poiIds.some((id) => !pois.has(id))) return null;

  if (entranceId === null) return pois;
  const entranceRows = await sql<{ id: string }[]>`
    WITH active_publication AS (
      SELECT snapshot.publication_id
      FROM scenic_published_snapshots AS snapshot
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = snapshot.scenic_area_id
      WHERE snapshot.scenic_area_id = ${scenicAreaId}
        AND snapshot.lifecycle_state = 'PUBLISHED'
        AND snapshot.published_at IS NOT NULL
        AND snapshot.published_by_subject IS NOT NULL
        AND snapshot.withdrawn_at IS NULL
        AND snapshot.expires_at > ${at}
        AND publication.lifecycle_state = 'PUBLISHED'
        AND publication.published_at IS NOT NULL
        AND publication.published_by_subject IS NOT NULL
        AND publication.withdrawn_at IS NULL
        AND publication.valid_until > ${at}
      ORDER BY snapshot.snapshot_revision DESC
      LIMIT 1
    )
    SELECT entrance.id
    FROM published_entrances AS entrance
    INNER JOIN active_publication AS active ON active.publication_id = entrance.publication_id
    INNER JOIN data_sources AS source
      ON source.id = entrance.source_id
     AND source.scenic_area_id = entrance.scenic_area_id
    WHERE entrance.scenic_area_id = ${scenicAreaId}
      AND entrance.id = ${entranceId}
      AND entrance.verification_state = 'FIELD_VERIFIED'
      AND entrance.field_verified_at IS NOT NULL
      AND entrance.field_verified_by_subject IS NOT NULL
      AND entrance.valid_until > ${at}
      AND source.license_state = 'CLEARED'
      AND source.verified_at IS NOT NULL
      AND source.verified_by_subject IS NOT NULL
      AND source.valid_until > ${at}
    LIMIT 1
  `;
  return entranceRows[0] ? pois : null;
}

async function insertRevisionStops(
  sql: QueryExecutor,
  itineraryId: string,
  revision: number,
  stops: ItineraryStopInput[],
  selectedPois: Map<string, PublishedPoiRow>,
) {
  for (const [index, stop] of stops.entries()) {
    const poi = selectedPois.get(stop.poiId);
    if (!poi) throw new Error("published_poi_selection_changed");
    await sql`
      INSERT INTO itinerary_stops (
        itinerary_id, itinerary_revision, sequence, original_place_name,
        matched_poi_id, match_confidence, dwell_minutes, unresolved
      ) VALUES (
        ${itineraryId}, ${revision}, ${index + 1}, ${poi.label},
        ${stop.poiId}, 1, ${stop.dwellMinutes}, false
      )
    `;
  }
}

/** No coordinates or trace data are written while invalidating old sessions. */
async function invalidatePriorExecution(
  sql: QueryExecutor,
  command: Pick<EditItineraryCommand | DeleteItineraryCommand, "identity" | "itineraryId" | "idempotencyKeyHash" | "occurredAt">,
  nextItineraryRevision: number,
  reason: "ITINERARY_REVISION_CHANGED" | "ITINERARY_DELETED",
) {
  const sessions = await sql<{ id: string }[]>`
    UPDATE visit_sessions
    SET lifecycle_state = 'INVALIDATED',
        expected_revision = expected_revision + 1,
        updated_at = ${command.occurredAt}
    WHERE scenic_area_id = ${command.identity.scenicAreaId}
      AND owner_account_id = ${command.identity.accountId}
      AND itinerary_id = ${command.itineraryId}
      AND itinerary_revision < ${nextItineraryRevision}
      AND lifecycle_state = ANY(${ACTIVE_SESSION_STATES}::text[])
    RETURNING id
  `;
  for (const session of sessions) {
    await sql`
      INSERT INTO visit_session_events (
        visit_session_id, event_type, metadata, idempotency_key_hash, occurred_at
      ) VALUES (
        ${session.id}, 'INVALIDATED',
        ${sql.json({ schemaVersion: 1, reason, itineraryRevision: nextItineraryRevision })},
        ${command.idempotencyKeyHash}, ${command.occurredAt}
      )
      ON CONFLICT (visit_session_id, idempotency_key_hash) DO NOTHING
    `;
  }
}

function ownedItinerarySelect(sql: QueryExecutor, identity: ItineraryIdentity, itineraryId: string) {
  return sql<ItineraryRow[]>`
    SELECT id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
           expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
    FROM itineraries
    WHERE id = ${itineraryId}
      AND scenic_area_id = ${identity.scenicAreaId}
      AND owner_account_id = ${identity.accountId}
    FOR UPDATE
  `;
}

function sameDeleteReplay(row: ItineraryRow, command: DeleteItineraryCommand) {
  return row.lifecycle_state === "DELETED"
    && row.idempotency_key_hash === command.idempotencyKeyHash
    && row.revision === command.input.expectedRevision + 1;
}

export const postgresItineraryRevisionRepository: ItineraryRepository = {
  async list(identity) {
    const sql = getDatabase();
    const rows = await sql<ItineraryRow[]>`
      SELECT id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
             expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
      FROM itineraries
      WHERE scenic_area_id = ${identity.scenicAreaId}
        AND owner_account_id = ${identity.accountId}
        AND lifecycle_state = 'SAVED'
        AND deleted_at IS NULL
      ORDER BY updated_at DESC, id ASC
      LIMIT 100
    `;
    return Promise.all(rows.map((row) => receiptForRow(sql, row)));
  },

  async read(identity, itineraryId) {
    const sql = getDatabase();
    const rows = await sql<ItineraryRow[]>`
      SELECT id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
             expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
      FROM itineraries
      WHERE id = ${itineraryId}
        AND scenic_area_id = ${identity.scenicAreaId}
        AND owner_account_id = ${identity.accountId}
        AND lifecycle_state = 'SAVED'
        AND deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0] ? receiptForRow(sql, rows[0]) : null;
  },

  async create(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const accounts = await transaction<{ id: string }[]>`
        SELECT id
        FROM visitor_accounts
        WHERE id = ${command.identity.accountId}
          AND scenic_area_id = ${command.identity.scenicAreaId}
          AND subject = ${command.identity.subject}
        FOR SHARE
      `;
      if (!accounts[0]) return { state: "ACCOUNT_NOT_FOUND" as const };

      const priorRows = await transaction<ItineraryRow[]>`
        SELECT id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
               expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
        FROM itineraries
        WHERE scenic_area_id = ${command.identity.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      const prior = priorRows[0];
      if (prior) {
        if (prior.owner_account_id !== command.identity.accountId || prior.lifecycle_state !== "SAVED" || prior.deleted_at !== null) {
          return { state: "IDEMPOTENCY_CONFLICT" as const };
        }
        const receipt = await receiptForRow(transaction, prior);
        return matchesEditableInput(receipt, command.input)
          ? { state: "REPLAYED" as const, itinerary: receipt }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }

      const selectedPois = await publishedSelections(
        transaction,
        command.identity.scenicAreaId,
        command.input.stops,
        command.input.entranceId,
        command.occurredAt,
      );
      if (!selectedPois) return { state: "PUBLISHED_CATALOG_UNAVAILABLE" as const };

      const insertedRows = await transaction<ItineraryRow[]>`
        INSERT INTO itineraries (
          scenic_area_id, owner_account_id, revision, lifecycle_state, title,
          starts_at, entrance_id, expected_revision, idempotency_key_hash, created_at, updated_at
        ) VALUES (
          ${command.identity.scenicAreaId}, ${command.identity.accountId}, 1, 'SAVED', ${command.input.title},
          ${command.input.startsAt}, ${command.input.entranceId}, 0, ${command.idempotencyKeyHash},
          ${command.occurredAt}, ${command.occurredAt}
        )
        RETURNING id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
                  expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
      `;
      const inserted = insertedRows[0];
      if (!inserted) throw new Error("itinerary_not_created");
      await insertRevisionStops(transaction, inserted.id, 1, command.input.stops, selectedPois);
      return { state: "CREATED" as const, itinerary: await receiptForRow(transaction, inserted) };
    });
  },

  async edit(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const currentRows = await ownedItinerarySelect(transaction, command.identity, command.itineraryId);
      const current = currentRows[0];
      if (!current || current.lifecycle_state === "DELETED" || current.deleted_at !== null) return { state: "NOT_FOUND" as const };
      if (current.lifecycle_state !== "SAVED") return { state: "NOT_FOUND" as const };

      if (current.idempotency_key_hash === command.idempotencyKeyHash) {
        const receipt = await receiptForRow(transaction, current);
        return matchesEditableInput(receipt, command.input)
          ? { state: "REPLAYED" as const, itinerary: receipt }
          : { state: "IDEMPOTENCY_CONFLICT" as const };
      }
      const currentReceipt = await receiptForRow(transaction, current);
      if (currentReceipt.revision !== command.input.expectedRevision) {
        return { state: "REVISION_CONFLICT" as const, currentRevision: currentReceipt.revision };
      }

      const priorKeyRows = await transaction<{ id: string }[]>`
        SELECT id
        FROM itineraries
        WHERE scenic_area_id = ${command.identity.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      if (priorKeyRows[0] && priorKeyRows[0].id !== command.itineraryId) return { state: "IDEMPOTENCY_CONFLICT" as const };

      const selectedPois = await publishedSelections(
        transaction,
        command.identity.scenicAreaId,
        command.input.stops,
        command.input.entranceId,
        command.occurredAt,
      );
      if (!selectedPois) return { state: "PUBLISHED_CATALOG_UNAVAILABLE" as const };

      const nextRevision = currentReceipt.revision + 1;
      if (!isItineraryCurrentRevision(nextRevision)) throw new Error("itinerary_revision_overflow");
      await insertRevisionStops(transaction, current.id, nextRevision, command.input.stops, selectedPois);
      const updatedRows = await transaction<ItineraryRow[]>`
        UPDATE itineraries
        SET revision = ${nextRevision},
            lifecycle_state = 'SAVED',
            title = ${command.input.title},
            starts_at = ${command.input.startsAt},
            entrance_id = ${command.input.entranceId},
            expected_revision = ${command.input.expectedRevision},
            idempotency_key_hash = ${command.idempotencyKeyHash},
            updated_at = ${command.occurredAt}
        WHERE id = ${command.itineraryId}
          AND scenic_area_id = ${command.identity.scenicAreaId}
          AND owner_account_id = ${command.identity.accountId}
          AND revision = ${command.input.expectedRevision}
          AND expected_revision = ${command.input.expectedRevision - 1}
        RETURNING id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
                  expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
      `;
      const updated = updatedRows[0];
      if (!updated) return { state: "REVISION_CONFLICT" as const, currentRevision: null };
      await invalidatePriorExecution(transaction, command, nextRevision, "ITINERARY_REVISION_CHANGED");
      return { state: "UPDATED" as const, itinerary: await receiptForRow(transaction, updated) };
    });
  },

  async remove(command) {
    const sql = getDatabase();
    return sql.begin(async (transaction) => {
      const currentRows = await ownedItinerarySelect(transaction, command.identity, command.itineraryId);
      const current = currentRows[0];
      if (!current) return { state: "NOT_FOUND" as const };
      if (current.lifecycle_state === "DELETED" || current.deleted_at !== null) {
        return sameDeleteReplay(current, command)
          ? { state: "REPLAYED" as const, itinerary: mapDeletedItinerary(current) }
          : { state: "NOT_FOUND" as const };
      }
      if (current.lifecycle_state !== "SAVED") return { state: "NOT_FOUND" as const };
      const currentReceipt = await receiptForRow(transaction, current);
      if (current.idempotency_key_hash === command.idempotencyKeyHash) return { state: "IDEMPOTENCY_CONFLICT" as const };
      if (currentReceipt.revision !== command.input.expectedRevision) {
        return { state: "REVISION_CONFLICT" as const, currentRevision: currentReceipt.revision };
      }

      const priorKeyRows = await transaction<{ id: string }[]>`
        SELECT id
        FROM itineraries
        WHERE scenic_area_id = ${command.identity.scenicAreaId}
          AND idempotency_key_hash = ${command.idempotencyKeyHash}
        FOR UPDATE
      `;
      if (priorKeyRows[0] && priorKeyRows[0].id !== command.itineraryId) return { state: "IDEMPOTENCY_CONFLICT" as const };

      const nextRevision = currentReceipt.revision + 1;
      if (!isItineraryCurrentRevision(nextRevision)) throw new Error("itinerary_revision_overflow");
      const deletedRows = await transaction<ItineraryRow[]>`
        UPDATE itineraries
        SET revision = ${nextRevision},
            lifecycle_state = 'DELETED',
            expected_revision = ${command.input.expectedRevision},
            idempotency_key_hash = ${command.idempotencyKeyHash},
            updated_at = ${command.occurredAt},
            deleted_at = ${command.occurredAt}
        WHERE id = ${command.itineraryId}
          AND scenic_area_id = ${command.identity.scenicAreaId}
          AND owner_account_id = ${command.identity.accountId}
          AND revision = ${command.input.expectedRevision}
          AND expected_revision = ${command.input.expectedRevision - 1}
        RETURNING id, scenic_area_id, owner_account_id, revision, lifecycle_state, title, starts_at, entrance_id,
                  expected_revision, idempotency_key_hash, created_at, updated_at, deleted_at
      `;
      const deleted = deletedRows[0];
      if (!deleted) return { state: "REVISION_CONFLICT" as const, currentRevision: null };
      await invalidatePriorExecution(transaction, command, nextRevision, "ITINERARY_DELETED");
      return { state: "DELETED" as const, itinerary: mapDeletedItinerary(deleted) };
    });
  },
};
