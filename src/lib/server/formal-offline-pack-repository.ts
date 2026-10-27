import "server-only";

import { getDatabase } from "./database";

export type PublishedFormalOfflinePackAssetRecord = {
  role: string;
  path: string;
  contentType: string;
  bytes: number;
  sha256: string;
  cachePolicy: string;
};

export type PublishedFormalOfflinePackRecord = {
  scenicAreaId: string;
  packId: string;
  packRevision: number;
  snapshotRevision: number;
  snapshotPublishedAt: string;
  networkRevision: string;
  operationalVersion: number;
  coordinateSystem: string;
  generatedAt: string;
  expiresAt: string;
  rightsEvidenceReference: string;
  manifestSha256: string;
  signatureValue: string;
  totalBytes: number;
  manifestJson: unknown;
  publicKeyId: string;
  publicJwk: unknown;
  assets: PublishedFormalOfflinePackAssetRecord[];
};

export type FormalOfflinePackRepository = {
  readCurrentPublishedPack(scenicAreaId: string): Promise<PublishedFormalOfflinePackRecord | null>;
};

type PublishedPackRow = {
  scenic_area_id: string;
  public_pack_id: string;
  pack_revision: number;
  snapshot_revision: number;
  snapshot_published_at: Date | string;
  network_revision: string;
  operational_version: number;
  coordinate_system: string;
  generated_at: Date | string;
  expires_at: Date | string;
  rights_evidence_reference: string;
  manifest_sha256: string;
  signature_value: string;
  total_bytes: number;
  manifest_json: unknown;
  public_key_id: string;
  public_jwk: unknown;
  assets: unknown;
};

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_formal_offline_pack_timestamp");
  return date.toISOString();
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("invalid_formal_offline_pack_integer");
  return number;
}

function mapAssets(value: unknown): PublishedFormalOfflinePackAssetRecord[] {
  if (!Array.isArray(value) || value.length < 1) throw new Error("invalid_formal_offline_pack_assets");
  return value.map((asset) => {
    if (!isRecord(asset)) throw new Error("invalid_formal_offline_pack_asset");
    const bytes = positiveInteger(asset.bytes);
    if (
      typeof asset.role !== "string"
      || typeof asset.path !== "string"
      || typeof asset.contentType !== "string"
      || typeof asset.sha256 !== "string"
      || typeof asset.cachePolicy !== "string"
    ) throw new Error("invalid_formal_offline_pack_asset");
    return {
      role: asset.role,
      path: asset.path,
      contentType: asset.contentType,
      bytes,
      sha256: asset.sha256,
      cachePolicy: asset.cachePolicy,
    };
  });
}

function mapPublishedPack(row: PublishedPackRow): PublishedFormalOfflinePackRecord {
  const totalBytes = positiveInteger(row.total_bytes);
  if (
    typeof row.scenic_area_id !== "string"
    || typeof row.public_pack_id !== "string"
    || typeof row.network_revision !== "string"
    || typeof row.coordinate_system !== "string"
    || typeof row.rights_evidence_reference !== "string"
    || typeof row.manifest_sha256 !== "string"
    || typeof row.signature_value !== "string"
    || typeof row.public_key_id !== "string"
  ) throw new Error("invalid_formal_offline_pack_record");
  return {
    scenicAreaId: row.scenic_area_id,
    packId: row.public_pack_id,
    packRevision: positiveInteger(row.pack_revision),
    snapshotRevision: positiveInteger(row.snapshot_revision),
    snapshotPublishedAt: toIso(row.snapshot_published_at),
    networkRevision: row.network_revision,
    operationalVersion: positiveInteger(row.operational_version),
    coordinateSystem: row.coordinate_system,
    generatedAt: toIso(row.generated_at),
    expiresAt: toIso(row.expires_at),
    rightsEvidenceReference: row.rights_evidence_reference,
    manifestSha256: row.manifest_sha256,
    signatureValue: row.signature_value,
    totalBytes,
    manifestJson: structuredClone(row.manifest_json),
    publicKeyId: row.public_key_id,
    publicJwk: structuredClone(row.public_jwk),
    assets: mapAssets(row.assets),
  };
}

/**
 * Reads a pack only through the complete publication chain. The single query
 * prevents a manifest and its asset inventory from being observed at different
 * publication states.
 */
export const postgresFormalOfflinePackRepository: FormalOfflinePackRepository = {
  async readCurrentPublishedPack(scenicAreaId) {
    const sql = getDatabase();
    const rows = await sql<PublishedPackRow[]>`
      SELECT
        pack.scenic_area_id,
        pack.public_pack_id,
        pack.pack_revision,
        snapshot.snapshot_revision,
        snapshot.published_at AS snapshot_published_at,
        network.revision AS network_revision,
        operational.operational_version,
        pack.coordinate_system,
        pack.generated_at,
        pack.expires_at,
        pack.rights_evidence_reference,
        pack.manifest_sha256,
        pack.signature_value,
        pack.total_bytes::double precision AS total_bytes,
        pack.manifest_json,
        signing_key.public_key_id,
        signing_key.public_jwk,
        jsonb_agg(
          jsonb_build_object(
            'role', asset.asset_role,
            'path', asset.asset_path,
            'contentType', asset.content_type,
            'bytes', asset.byte_length,
            'sha256', asset.sha256,
            'cachePolicy', asset.cache_policy
          ) ORDER BY asset.asset_path
        ) AS assets
      FROM formal_offline_packs AS pack
      INNER JOIN scenic_published_snapshots AS snapshot
        ON snapshot.id = pack.published_snapshot_id
       AND snapshot.scenic_area_id = pack.scenic_area_id
      INNER JOIN scenic_area_publications AS publication
        ON publication.id = snapshot.publication_id
       AND publication.scenic_area_id = pack.scenic_area_id
      INNER JOIN route_network_revisions AS network
        ON network.id = snapshot.network_revision_id
       AND network.scenic_area_id = pack.scenic_area_id
      INNER JOIN data_sources AS route_source
        ON route_source.id = network.source_id
       AND route_source.scenic_area_id = pack.scenic_area_id
      INNER JOIN route_operational_versions AS operational
        ON operational.id = snapshot.operational_version_id
       AND operational.scenic_area_id = pack.scenic_area_id
       AND operational.network_revision_id = snapshot.network_revision_id
      INNER JOIN offline_pack_signing_keys AS signing_key
        ON signing_key.id = pack.signing_key_id
       AND signing_key.scenic_area_id = pack.scenic_area_id
      INNER JOIN formal_offline_pack_reviews AS gis_review
        ON gis_review.offline_pack_id = pack.id
       AND gis_review.scenic_area_id = pack.scenic_area_id
       AND gis_review.review_role = 'GIS_REVIEWER'
      INNER JOIN formal_offline_pack_reviews AS management_review
        ON management_review.offline_pack_id = pack.id
       AND management_review.scenic_area_id = pack.scenic_area_id
       AND management_review.review_role = 'MANAGEMENT_APPROVER'
      INNER JOIN formal_offline_pack_assets AS asset
        ON asset.offline_pack_id = pack.id
       AND asset.scenic_area_id = pack.scenic_area_id
      WHERE pack.scenic_area_id = ${scenicAreaId}
        AND pack.lifecycle_state = 'PUBLISHED'
        AND pack.published_at IS NOT NULL
        AND pack.published_by_subject IS NOT NULL
        AND pack.withdrawn_at IS NULL
        AND pack.generated_at <= CURRENT_TIMESTAMP
        AND pack.expires_at > CURRENT_TIMESTAMP
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
        AND signing_key.lifecycle_state = 'ACTIVE'
        AND signing_key.algorithm = 'ECDSA_P256_SHA256'
        AND signing_key.valid_from <= CURRENT_TIMESTAMP
        AND signing_key.valid_until > CURRENT_TIMESTAMP
        AND signing_key.retired_at IS NULL
        AND NOT (signing_key.public_jwk ? 'd')
        AND gis_review.outcome = 'APPROVED'
        AND gis_review.reviewed_manifest_sha256 = pack.manifest_sha256
        AND gis_review.expires_at > CURRENT_TIMESTAMP
        AND management_review.outcome = 'APPROVED'
        AND management_review.reviewed_manifest_sha256 = pack.manifest_sha256
        AND management_review.expires_at > CURRENT_TIMESTAMP
        AND gis_review.reviewer_subject <> management_review.reviewer_subject
        AND NOT EXISTS (
          SELECT 1
          FROM closure_events AS closure
          WHERE closure.scenic_area_id = pack.scenic_area_id
            AND closure.network_revision_id = snapshot.network_revision_id
            AND closure.withdrawn_at IS NULL
            AND closure.starts_at <= CURRENT_TIMESTAMP
            AND closure.expires_at > CURRENT_TIMESTAMP
            AND closure.created_at >= operational.issued_at
        )
      GROUP BY
        pack.id,
        snapshot.snapshot_revision,
        snapshot.published_at,
        network.revision,
        operational.operational_version,
        signing_key.id
      ORDER BY pack.pack_revision DESC
      LIMIT 1
    `;
    return rows[0] ? mapPublishedPack(rows[0]) : null;
  },
};
