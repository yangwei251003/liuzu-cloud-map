import {
  createShareLinkMaterial,
  evaluateShareLinkRecord,
  hashShareToken,
  isShareId,
  isShareToken,
  verifyShareToken,
  type AuthenticatedShareLinkRecord,
  type AuthenticatedShareOwner,
  type CreateServerShareInput,
  type ShareLinkRecord,
  type ServerSharePayload,
} from "./share-link-domain";

export type StoredServerShareLink = ShareLinkRecord & { id: string };

export type ShareLinkRepository = {
  create(record: AuthenticatedShareLinkRecord): Promise<{ id: string }>;
  findByPublicTokenHash(tokenHash: string): Promise<StoredServerShareLink | null>;
  revokeOwned(
    input: {
      shareId: string;
      scenicAreaId: string;
      accountId: string;
      actorSubject: string;
      revokeTokenHash: string | null;
      revokedAt: string;
    },
  ): Promise<"REVOKED" | "ALREADY_REVOKED" | "NOT_FOUND">;
};

export type ReadServerShareResult =
  | { state: "ACTIVE"; id: string; scenicAreaId: string; payload: ServerSharePayload; createdAt: string; expiresAt: string }
  | { state: "EXPIRED" | "REVOKED" | "INVALID" | "NOT_FOUND" };

export async function createServerShare(
  repository: ShareLinkRepository,
  input: CreateServerShareInput,
  owner: AuthenticatedShareOwner,
  now = new Date(),
) {
  const material = createShareLinkMaterial(input, owner, now);
  const persisted = await repository.create(material.record);
  if (!isShareId(persisted.id)) throw new Error("invalid_persisted_share_id");
  return {
    id: persisted.id,
    publicToken: material.publicToken,
    revokeToken: material.revokeToken,
    createdAt: material.record.createdAt,
    expiresAt: material.record.expiresAt,
  };
}

export async function readServerShare(
  repository: ShareLinkRepository,
  publicToken: unknown,
  now = new Date(),
): Promise<ReadServerShareResult> {
  if (!isShareToken(publicToken)) return { state: "INVALID" };
  const record = await repository.findByPublicTokenHash(hashShareToken(publicToken));
  if (!record) return { state: "NOT_FOUND" };
  if (!isShareId(record.id) || !verifyShareToken(publicToken, record.tokenHash)) return { state: "INVALID" };
  const state = evaluateShareLinkRecord(record, now);
  if (state !== "ACTIVE") return { state };
  return {
    state,
    id: record.id,
    scenicAreaId: record.scenicAreaId,
    payload: record.payload,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

export async function revokeServerShare(
  repository: ShareLinkRepository,
  shareId: unknown,
  owner: AuthenticatedShareOwner,
  revokeToken: unknown = null,
  now = new Date(),
) {
  const revokeTokenHash = revokeToken === null || revokeToken === undefined
    ? null
    : isShareToken(revokeToken)
      ? hashShareToken(revokeToken)
      : undefined;
  if (
    !isShareId(shareId) ||
    !isShareId(owner.accountId) ||
    owner.subject !== `visitor:${owner.scenicAreaId}:${owner.accountId}` ||
    revokeTokenHash === undefined ||
    Number.isNaN(now.getTime())
  ) {
    return "NOT_FOUND" as const;
  }
  return repository.revokeOwned({
    shareId,
    scenicAreaId: owner.scenicAreaId,
    accountId: owner.accountId,
    actorSubject: owner.subject,
    revokeTokenHash,
    revokedAt: now.toISOString(),
  });
}
