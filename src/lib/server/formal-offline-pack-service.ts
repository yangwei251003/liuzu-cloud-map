import { createHash } from "node:crypto";
import {
  canonicalFormalOfflinePackManifest,
  parseFormalOfflinePackManifest,
  type FormalOfflinePackManifest,
} from "../formal-offline-pack";
import { isFormalRoutingId } from "./formal-routing-domain";
import type {
  FormalOfflinePackRepository,
  PublishedFormalOfflinePackAssetRecord,
  PublishedFormalOfflinePackRecord,
} from "./formal-offline-pack-repository";

export type FormalOfflinePackDownloadEnvelope = {
  schemaVersion: 1;
  manifest: FormalOfflinePackManifest;
  verificationKey: JsonWebKey;
  expectedKeyId: string;
};

export type ReadFormalOfflinePackResult =
  | { state: "AVAILABLE"; envelope: FormalOfflinePackDownloadEnvelope }
  | { state: "FORMAL_OFFLINE_PACK_UNAVAILABLE" };

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const BASE64URL_COORDINATE = /^[A-Za-z0-9_-]{43}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_LIFETIME_MS = 72 * 60 * 60_000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

function publicVerificationKey(value: unknown): JsonWebKey | null {
  if (
    !isRecord(value)
    || value.kty !== "EC"
    || value.crv !== "P-256"
    || typeof value.x !== "string"
    || !BASE64URL_COORDINATE.test(value.x)
    || typeof value.y !== "string"
    || !BASE64URL_COORDINATE.test(value.y)
    || Object.hasOwn(value, "d")
  ) return null;
  return {
    kty: "EC",
    crv: "P-256",
    x: value.x,
    y: value.y,
    ext: true,
    key_ops: ["verify"],
  };
}

function sameAsset(left: PublishedFormalOfflinePackAssetRecord, right: FormalOfflinePackManifest["assets"][number]) {
  return left.role === right.role
    && left.path === right.path
    && left.contentType === right.contentType
    && left.bytes === right.bytes
    && left.sha256 === right.sha256
    && left.cachePolicy === right.cachePolicy;
}

function metadataMatches(record: PublishedFormalOfflinePackRecord, manifest: FormalOfflinePackManifest, now: Date) {
  const nowMs = now.getTime();
  const generatedAt = new Date(record.generatedAt).getTime();
  const snapshotPublishedAt = new Date(record.snapshotPublishedAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const sortedRecordAssets = [...record.assets].sort((a, b) => a.path.localeCompare(b.path));
  const sortedManifestAssets = [...manifest.assets].sort((a, b) => a.path.localeCompare(b.path));
  const summedBytes = sortedRecordAssets.reduce((sum, asset) => sum + asset.bytes, 0);
  return Number.isFinite(nowMs)
    && Number.isFinite(generatedAt)
    && Number.isFinite(snapshotPublishedAt)
    && snapshotPublishedAt <= nowMs + FUTURE_CLOCK_SKEW_MS
    && snapshotPublishedAt <= generatedAt + FUTURE_CLOCK_SKEW_MS
    && Number.isFinite(expiresAt)
    && generatedAt <= nowMs + FUTURE_CLOCK_SKEW_MS
    && expiresAt > nowMs
    && expiresAt > generatedAt
    && expiresAt - generatedAt <= MAX_LIFETIME_MS
    && record.scenicAreaId === manifest.scenicAreaId
    && record.packId === manifest.packId
    && record.packRevision === manifest.packRevision
    && record.snapshotRevision === manifest.snapshotRevision
    && record.snapshotPublishedAt === manifest.snapshotPublishedAt
    && record.networkRevision === manifest.networkRevision
    && record.operationalVersion === manifest.operationalVersion
    && record.coordinateSystem === manifest.coordinateSystem
    && record.generatedAt === manifest.generatedAt
    && record.expiresAt === manifest.expiresAt
    && record.rightsEvidenceReference === manifest.rights.evidenceReference
    && record.signatureValue === manifest.signature.value
    && record.publicKeyId === manifest.signature.keyId
    && record.totalBytes === summedBytes
    && record.totalBytes === manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)
    && sortedRecordAssets.length === sortedManifestAssets.length
    && sortedRecordAssets.every((asset, index) => sameAsset(asset, sortedManifestAssets[index]));
}

function validatedEnvelope(
  record: PublishedFormalOfflinePackRecord,
  scenicAreaId: string,
  now: Date,
): FormalOfflinePackDownloadEnvelope | null {
  const manifest = parseFormalOfflinePackManifest(record.manifestJson);
  const verificationKey = publicVerificationKey(record.publicJwk);
  if (!manifest || !verificationKey || record.scenicAreaId !== scenicAreaId || !metadataMatches(record, manifest, now)) return null;
  if (!SHA256_PATTERN.test(record.manifestSha256)) return null;
  const actualHash = createHash("sha256")
    .update(canonicalFormalOfflinePackManifest(manifest), "utf8")
    .digest("hex");
  if (actualHash !== record.manifestSha256) return null;
  return {
    schemaVersion: 1,
    manifest,
    verificationKey,
    expectedKeyId: record.publicKeyId,
  };
}

export async function readFormalOfflinePack(
  repository: FormalOfflinePackRepository,
  scenicAreaId: string,
  now = new Date(),
): Promise<ReadFormalOfflinePackResult> {
  if (!isFormalRoutingId(scenicAreaId) || Number.isNaN(now.getTime())) {
    return { state: "FORMAL_OFFLINE_PACK_UNAVAILABLE" };
  }
  try {
    const record = await repository.readCurrentPublishedPack(scenicAreaId);
    if (!record) return { state: "FORMAL_OFFLINE_PACK_UNAVAILABLE" };
    const envelope = validatedEnvelope(record, scenicAreaId, now);
    return envelope
      ? { state: "AVAILABLE", envelope }
      : { state: "FORMAL_OFFLINE_PACK_UNAVAILABLE" };
  } catch {
    return { state: "FORMAL_OFFLINE_PACK_UNAVAILABLE" };
  }
}
