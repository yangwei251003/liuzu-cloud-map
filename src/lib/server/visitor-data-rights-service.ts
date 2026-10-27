import { verifyVisitorPassphrase, type VisitorIdentity } from "./visitor-identity-domain";
import {
  createDataSubjectRequestReference,
  type ConsentPurpose,
  type ConsentWriteInput,
} from "./visitor-data-rights-domain";
import type { ServerSharePayload } from "./share-link-domain";
import type { VisitorAccountRecord, VisitorIdentityRepository } from "./visitor-identity-service";

export type VisitorConsentRecord = {
  purpose: ConsentPurpose;
  granted: boolean;
  revision: number;
  recordedAt: string;
};

export type VisitorDataExport = {
  schemaVersion: 1;
  exportedAt: string;
  receipt: {
    reference: string;
    completedAt: string;
  };
  visitor: {
    scenicAreaId: string;
    subject: string;
    handle: string;
    createdAt: string;
  };
  consents: VisitorConsentRecord[];
  itineraries: Array<{
    id: string;
    revision: number;
    lifecycleState: string;
    title: string;
    startsAt: string | null;
    createdAt: string;
    updatedAt: string;
    stops: Array<{
      sequence: number;
      originalPlaceName: string;
      matchedPoiId: string | null;
      arrivalAt: string | null;
      departureAt: string | null;
      dwellMinutes: number | null;
      rationale: string | null;
      travelMode: string | null;
      mealNote: string | null;
      restNote: string | null;
      cautionNote: string | null;
      unresolved: boolean;
    }>;
  }>;
  visitSessions: Array<{
    id: string;
    itineraryId: string | null;
    itineraryRevision: number | null;
    lifecycleState: string;
    narrationEnabled: boolean;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    updatedAt: string;
    events: Array<{ type: string; occurredAt: string }>;
  }>;
  navigationSessions: Array<{
    id: string;
    routeFingerprint: string;
    optimization: string;
    originNodeId: string;
    destinationNodeId: string;
    networkRevision: string;
    operationalVersion: number;
    status: string;
    revision: number;
    distanceMeters: number;
    estimatedMinutes: number;
    remainingDistanceBucketMeters: number;
    startedAt: string | null;
    endedAt: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    events: Array<{
      type: string;
      revision: number;
      remainingDistanceBucketMeters: number;
      reasonCode: string | null;
      occurredAt: string;
    }>;
  }>;
  shareLinks: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    route: ServerSharePayload | null;
  }>;
};

export type VisitorDataRightsRepository = {
  listConsents(identity: VisitorIdentity): Promise<VisitorConsentRecord[]>;
  writeConsent(input: {
    identity: VisitorIdentity;
    consent: ConsentWriteInput;
    idempotencyKeyHash: string;
    recordedAt: string;
  }): Promise<
    | { state: "APPLIED" | "REPLAYED"; consent: VisitorConsentRecord }
    | { state: "REVISION_CONFLICT"; currentRevision: number | null }
    | { state: "IDEMPOTENCY_CONFLICT" | "ACCOUNT_NOT_FOUND" }
  >;
  exportData(input: {
    identity: VisitorIdentity;
    idempotencyKeyHash: string;
    requestReference: string;
    exportedAt: string;
  }): Promise<
    | { state: "COMPLETED" | "REPLAYED"; data: VisitorDataExport }
    | { state: "IDEMPOTENCY_CONFLICT" | "ACCOUNT_NOT_FOUND" }
  >;
  deleteAccount(input: {
    identity: VisitorIdentity;
    idempotencyKeyHash: string;
    requestReference: string;
    deletedAt: string;
  }): Promise<
    | { state: "DELETED"; receipt: { reference: string; completedAt: string } }
    | { state: "IDEMPOTENCY_CONFLICT" | "ACCOUNT_NOT_FOUND" }
  >;
};

function sameIdentity(account: VisitorAccountRecord, identity: VisitorIdentity) {
  return (
    account.accountId === identity.accountId &&
    account.scenicAreaId === identity.scenicAreaId &&
    account.subject === identity.subject &&
    account.handle === identity.handle
  );
}

export async function getVisitorConsents(repository: VisitorDataRightsRepository, identity: VisitorIdentity) {
  return repository.listConsents(identity);
}

export async function writeVisitorConsent(
  repository: VisitorDataRightsRepository,
  identity: VisitorIdentity,
  consent: ConsentWriteInput,
  idempotencyKeyHash: string,
  now = new Date(),
) {
  if (Number.isNaN(now.getTime())) throw new Error("invalid_consent_write_time");
  return repository.writeConsent({
    identity,
    consent,
    idempotencyKeyHash,
    recordedAt: now.toISOString(),
  });
}

export async function exportVisitorData(
  repository: VisitorDataRightsRepository,
  identity: VisitorIdentity,
  idempotencyKeyHash: string,
  now = new Date(),
) {
  if (Number.isNaN(now.getTime())) throw new Error("invalid_export_time");
  const exportedAt = now.toISOString();
  return repository.exportData({
    identity,
    idempotencyKeyHash,
    requestReference: createDataSubjectRequestReference(),
    exportedAt,
  });
}

export async function deleteVisitorAccount(
  identityRepository: Pick<VisitorIdentityRepository, "findAccountByHandle">,
  dataRightsRepository: VisitorDataRightsRepository,
  identity: VisitorIdentity,
  currentPassphrase: string,
  idempotencyKeyHash: string,
  now = new Date(),
) {
  if (Number.isNaN(now.getTime())) return { state: "REAUTH_FAILED" as const };
  const account = await identityRepository.findAccountByHandle(identity.scenicAreaId, identity.handle);
  if (!account || !sameIdentity(account, identity) || !(await verifyVisitorPassphrase(currentPassphrase, account))) {
    return { state: "REAUTH_FAILED" as const };
  }
  return dataRightsRepository.deleteAccount({
    identity,
    idempotencyKeyHash,
    requestReference: createDataSubjectRequestReference(),
    deletedAt: now.toISOString(),
  });
}
