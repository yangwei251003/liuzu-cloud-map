import "server-only";

import { getDatabase } from "./database";

export type PublishedFormalRoutingSnapshotRecord = {
  scenicAreaId: string;
  snapshotRevision: number;
  networkRevision: string;
  operationalVersion: number;
  publishedAt: string;
  expiresAt: string;
  snapshotJson: unknown;
};

export type FormalRoutingRepository = {
  readCurrentPublishedSnapshot(scenicAreaId: string): Promise<PublishedFormalRoutingSnapshotRecord | null>;
};

type PublishedSnapshotRow = {
  scenic_area_id: string;
  snapshot_revision: number;
  network_revision: string;
  operational_version: number;
  published_at: Date | string;
  expires_at: Date | string;
  snapshot_json: unknown;
};

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_formal_routing_snapshot_timestamp");
  return date.toISOString();
}

function mapPublishedSnapshot(row: PublishedSnapshotRow): PublishedFormalRoutingSnapshotRecord {
  if (
    !Number.isSafeInteger(row.snapshot_revision)
    || row.snapshot_revision < 1
    || !Number.isSafeInteger(row.operational_version)
    || row.operational_version < 1
    || typeof row.scenic_area_id !== "string"
    || typeof row.network_revision !== "string"
  ) {
    throw new Error("invalid_formal_routing_snapshot_record");
  }
  return {
    scenicAreaId: row.scenic_area_id,
    snapshotRevision: row.snapshot_revision,
    networkRevision: row.network_revision,
    operationalVersion: row.operational_version,
    publishedAt: toIso(row.published_at),
    expiresAt: toIso(row.expires_at),
    snapshotJson: structuredClone(row.snapshot_json),
  };
}

/**
 * Reads only a transactionally published snapshot. This intentionally returns
 * no partial GIS tables or prototype geometry: the service will separately
 * validate the closed JSON contracts before invoking the route engine.
 */
export const postgresFormalRoutingRepository: FormalRoutingRepository = {
  async readCurrentPublishedSnapshot(scenicAreaId) {
    const sql = getDatabase();
    const rows = await sql<PublishedSnapshotRow[]>`
      SELECT
        snapshot.scenic_area_id,
        snapshot.snapshot_revision,
        network.revision AS network_revision,
        operational.operational_version,
        snapshot.published_at,
        snapshot.expires_at,
        snapshot.snapshot_json
      FROM scenic_published_snapshots AS snapshot
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN route_network_revisions AS network
        ON network.id = snapshot.network_revision_id
       AND network.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN data_sources AS route_source
        ON route_source.id = network.source_id
       AND route_source.scenic_area_id = snapshot.scenic_area_id
      INNER JOIN route_operational_versions AS operational
        ON operational.id = snapshot.operational_version_id
       AND operational.scenic_area_id = snapshot.scenic_area_id
       AND operational.network_revision_id = snapshot.network_revision_id
      WHERE snapshot.scenic_area_id = ${scenicAreaId}
        AND snapshot.lifecycle_state = 'PUBLISHED'
        AND snapshot.published_at IS NOT NULL
        AND snapshot.published_by_subject IS NOT NULL
        AND snapshot.withdrawn_at IS NULL
        AND snapshot.expires_at > CURRENT_TIMESTAMP
        AND publication.lifecycle_state = 'PUBLISHED'
        AND publication.published_at IS NOT NULL
        AND publication.published_by_subject IS NOT NULL
        AND publication.withdrawn_at IS NULL
        AND publication.valid_until > CURRENT_TIMESTAMP
        AND network.lifecycle_state = 'PUBLISHED'
        AND network.verification_state = 'FIELD_VERIFIED'
        AND network.coordinate_system = 'WGS84'
        AND network.valid_until > CURRENT_TIMESTAMP
        AND route_source.license_state = 'CLEARED'
        AND route_source.verified_at IS NOT NULL
        AND route_source.verified_by_subject IS NOT NULL
        AND route_source.valid_until > CURRENT_TIMESTAMP
        AND operational.lifecycle_state = 'PUBLISHED'
        AND operational.published_by_subject IS NOT NULL
        AND operational.issued_at <= CURRENT_TIMESTAMP
        AND operational.expires_at > CURRENT_TIMESTAMP
        AND NOT EXISTS (
          SELECT 1
          FROM closure_events AS closure
          WHERE closure.scenic_area_id = snapshot.scenic_area_id
            AND closure.network_revision_id = snapshot.network_revision_id
            AND closure.withdrawn_at IS NULL
            AND closure.starts_at <= CURRENT_TIMESTAMP
            AND closure.expires_at > CURRENT_TIMESTAMP
            AND closure.created_at >= operational.issued_at
        )
      ORDER BY snapshot.snapshot_revision DESC
      LIMIT 1
    `;
    return rows[0] ? mapPublishedSnapshot(rows[0]) : null;
  },
};
